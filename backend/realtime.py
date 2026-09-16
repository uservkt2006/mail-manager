"""Realtime sync for Mail Manager (v3.4).

Exchange streaming subscriptions subscribe fine on mail.fpt.net but never deliver
notifications (verified empirically), so realtime uses the mechanism Outlook itself
uses for fast incremental updates: SyncFolderItems delta sync (exchangelib
Folder.sync_items).

A background daemon per user polls the folders that full-sync registered in
`folder_sync`, storing only what changed — one small EWS round-trip per folder
(~1-2s total) — instead of re-walking the whole tree. Events publish to an
in-memory SSE hub (/api/events) so the browser updates without a manual refresh.

sync_items contract (verified against installed exchangelib 5.6):
  yields (change_type, item) with change_type in {"create","update","delete"};
  delete gives an ItemId (str() = "changekey|id"); create/update give full Items.
  Fully consuming the generator raises SyncCompleted(sync_state=...) which carries
  the new state token.
"""
import os
import json
import time
import sqlite3
import logging
import threading

logger = logging.getLogger(__name__)

POLL_SECONDS = int(os.environ.get("MM_REALTIME_SEC", "8"))
_enabled = os.environ.get("MM_REALTIME", "1") != "0"

_watch = {}            # user_id -> {"stop": Event, "thread": Thread}
_hub_lock = threading.Lock()
_hub = {}              # user_id -> list[queue]
_recent = {}           # user_id -> deque of events for reconnecting clients


# ─── SSE hub ──────────────────────────────────────────────────────────
def subscribe(user_id):
    import queue
    q = queue.Queue(maxsize=32)
    with _hub_lock:
        _hub.setdefault(user_id, []).append(q)
    return q


def unsubscribe(user_id, q):
    with _hub_lock:
        lst = _hub.get(user_id) or []
        if q in lst:
            lst.remove(q)


def publish(user_id, event):
    import collections
    with _hub_lock:
        _recent.setdefault(user_id, collections.deque(maxlen=20)).append(event)
        for q in _hub.get(user_id) or []:
            try:
                q.put_nowait(event)
            except Exception:
                pass


def recent_since(user_id, ts):
    with _hub_lock:
        return [e for e in _recent.get(user_id, ()) if e.get("ts", 0) > ts]


# ─── delta sync core ──────────────────────────────────────────────────
def _conn():
    from app import DB_PATH
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA busy_timeout = 30000")
    return c


def _server_folders_by_name(account):
    from app import nfck, SYNC_SKIP
    out = {}
    stack = list(account.root.children)
    while stack:
        f = stack.pop()
        try:
            stack.extend(list(f.children))
        except Exception:
            pass
        if (getattr(f, "folder_class", "") or "").endswith(".Note"):
            n = nfck(f.name)
            if n not in SYNC_SKIP:
                out.setdefault(n, f)
    return out


def _collect_changes(folder, sync_state):
    """Run sync_items to completion; return (new_state, [(change_type, item)])."""
    from exchangelib.folders.collections import SyncCompleted
    only = ["subject", "body", "sender", "to_recipients", "cc_recipients", "bcc_recipients",
            "datetime_received", "message_id", "is_read", "attachments", "importance"]
    changes = []
    try:
        for ch in folder.sync_items(sync_state=sync_state, only_fields=only):
            changes.append(ch)
    except SyncCompleted as e:
        return e.sync_state, changes
    except StopIteration:
        pass
    return getattr(folder, "item_sync_state", None) or sync_state, changes


def _apply_delta(user_id, a, conn, by_name, row):
    """One folder's delta. Returns #new messages stored.
    First pass (no saved state) bootstraps: the snapshot is discarded (not stored)
    and only the new sync state persisted, keeping steady passes tiny."""
    from app import store_ews_message, get_or_create_folder
    path = json.loads(row["folder_path"])
    server_f = by_name.get(path[-1])
    if server_f is None or row["local_folder_id"] is None:
        return 0
    bootstrap = not row["ews_sync_state"]
    new_state, changes = _collect_changes(server_f, row["ews_sync_state"])
    touched = 0
    if not bootstrap:
        trash = get_or_create_folder(conn, user_id, "trash")
        ts = time.strftime("%Y-%m-%dT%H:%M:%S")
        for change_type, m in changes:
            try:
                if change_type == "delete":
                    # ItemId repr includes a rotating changekey — match on the stable base64 id
                    raw = getattr(getattr(m, "id", None), "id", None) or str(m)
                    conn.execute("UPDATE messages SET deleted_at=?, folder_id=?"
                                 " WHERE user_id=? AND folder_id=? AND deleted_at IS NULL AND ews_item_id LIKE ?",
                                 (ts, trash, user_id, row["local_folder_id"], f"%{raw}%"))
                    publish(user_id, {"type": "changed", "ts": time.time()})
                elif change_type == "read_flag_change":
                    item_id, is_read = m if isinstance(m, tuple) else (m, True)
                    raw = getattr(getattr(item_id, "id", None), "id", None) or str(item_id)
                    conn.execute("UPDATE messages SET is_read=? WHERE user_id=? AND ews_item_id LIKE ?",
                                 (1 if is_read else 0, user_id, f"%{raw}%"))
                    publish(user_id, {"type": "changed", "ts": time.time()})
                else:  # create / update with full item
                    # ID_ONLY shape returns empty bodies — fetch full props now
                    # (one GetItem round-trip) so opening the mail is instant
                    try:
                        if getattr(m, "body", None) is None and hasattr(m, "refresh"):
                            m.refresh()
                    except Exception:
                        pass
                    if store_ews_message(conn, user_id, a["id"], row["local_folder_id"], m):
                        touched += 1
                        publish(user_id, {"type": "new_mail",
                                          "subject": getattr(m, "subject", "") or "",
                                          "ts": time.time()})
                    elif change_type == "update":
                        publish(user_id, {"type": "changed", "ts": time.time()})
                    conn.commit()   # don't hold the write lock across the next network refresh()
            except Exception as e:
                logger.error(f"delta apply {path[-1]}: {e}")
    if new_state and new_state != row["ews_sync_state"]:
        conn.execute("UPDATE folder_sync SET ews_sync_state=?, updated_at=CURRENT_TIMESTAMP"
                     " WHERE user_id=? AND folder_path=?", (new_state, user_id, row["folder_path"]))
    return touched


def _register_folders(user_id):
    """Bootstrap folder_sync rows without a full sync (mirrors sync_mailbox mapping,
    later corrected by any full sync). Returns #registered."""
    from app import (ews_connect, user_accounts, decrypt_password, nfck, classify_folder,
                     get_or_create_folder, SYNC_SKIP, ROOT_WRAPPERS)
    accts = user_accounts(user_id)
    if not accts:
        return 0
    a = accts[0]
    account = ews_connect(a["address"], decrypt_password(a["password_encrypted"]), a["server_url"])

    def chain(conn, names):
        names = [nfck(n) for n in names]
        leaf = classify_folder(names[-1])
        if leaf != "user":
            return get_or_create_folder(conn, user_id, leaf)
        parent = None
        for n in names:
            parent = get_or_create_folder(conn, user_id, "user", n, parent)
        return parent

    def collect(folders, path=()):
        for f in folders:
            try:
                fclass = f.folder_class or ""
                cnt = f.total_count
            except Exception:
                continue
            try:
                kids = list(f.children)
            except Exception:
                kids = []
            if nfck(f.name).lower() in ROOT_WRAPPERS:
                yield from collect(kids, path)
                continue
            p = path + (f.name,)
            if fclass.endswith(".Note") and cnt and nfck(f.name) not in SYNC_SKIP:
                yield f, p
            if kids:
                yield from collect(kids, p)

    conn = _conn()
    n = 0
    try:
        for folder, path in collect(list(account.root.children)):
            lid = chain(conn, path)
            cur = conn.execute("SELECT 1 FROM folder_sync WHERE user_id=? AND folder_path=?",
                               (user_id, json.dumps([nfck(x) for x in path]))).fetchone()
            if not cur:
                conn.execute("INSERT INTO folder_sync (user_id,folder_path,local_folder_id) VALUES (?,?,?)",
                             (user_id, json.dumps([nfck(x) for x in path]), lid))
                n += 1
        conn.commit()
    finally:
        conn.close()
    return n


def _delta_pass(user_id, cached=None):
    """One cheap incremental pass over registered folders. Returns #new mails.
    cached: dict reused across passes — holds 'account' + 'by_name' + expiry ts."""
    from app import ews_connect, user_accounts, decrypt_password
    accts = user_accounts(user_id)
    if not accts:
        return 0
    a = accts[0]
    conn = _conn()
    try:
        rows = conn.execute("SELECT folder_path, local_folder_id, ews_sync_state FROM folder_sync WHERE user_id=?",
                            (user_id,)).fetchall()
        if not rows:
            # first realtime boot on an existing DB: register folders without a full sync
            try:
                _register_folders(user_id)
            except Exception as e:
                logger.error(f"realtime register {user_id}: {e}")
                return 0
            rows = conn.execute("SELECT folder_path, local_folder_id, ews_sync_state FROM folder_sync WHERE user_id=?",
                                (user_id,)).fetchall()
            if not rows:
                return 0
        now = time.time()
        account = cached.get("account") if cached else None
        if account is None or now - (cached.get("born") or 0) > 600:
            account = ews_connect(a["address"], decrypt_password(a["password_encrypted"]), a["server_url"])
            if cached is not None:
                cached["account"] = account
                cached["born"] = now
                cached["by_name_ts"] = 0
        by_name = cached.get("by_name") if cached else None
        if by_name is None or now - cached.get("by_name_ts", 0) > 300:
            by_name = _server_folders_by_name(account)
            if cached is not None:
                cached["by_name"] = by_name
                cached["by_name_ts"] = now
        touched = 0
        for row in rows:
            touched += _apply_delta(user_id, a, conn, by_name, row)
            conn.commit()   # short transactions: don't hold the write lock across network calls
        conn.commit()
        return touched
    except Exception:
        if cached is not None:  # force fresh connection next pass
            cached.pop("account", None)
            cached.pop("by_name", None)
        raise
    finally:
        conn.close()


def _catchup_empty(user_id, limit=8):
    """Background-drain rows stored empty by ID_ONLY delta passes via the shared
    hydration queue (one EWS worker, priority for clicks)."""
    conn = _conn()
    try:
        rows = conn.execute("""SELECT id FROM messages WHERE user_id=? AND deleted_at IS NULL
                               AND (body='' OR body IS NULL) AND (html_body='' OR html_body IS NULL)
                               AND message_id IS NOT NULL
                               ORDER BY date DESC LIMIT ?""", (user_id, limit)).fetchall()
    finally:
        conn.close()
    from app import hq_push
    n = 0
    for r in rows:
        if hq_push(user_id, r["id"]):
            n += 1
    return n


def _loop(user_id, stop):
    from app import get_settings
    err_streak = 0
    cached = {}
    while not stop.is_set():
        if stop.wait(min(POLL_SECONDS * (2 ** min(err_streak, 4)), 120)):
            break
        if err_streak:
            cached.clear()      # after a failure, force a fresh EWS connection
        try:
            n = _delta_pass(user_id, cached)
            err_streak = 0
            if n == 0:
                _catchup_empty(user_id, limit=6)   # quiet pass: drain old empty-body rows
        except Exception as e:
            err_streak += 1
            logger.error(f"realtime {user_id}: {type(e).__name__} {e}")
        # deep sync (calendar/contacts + folder tree) every sync_interval_min minutes
        try:
            interval = max(int(get_settings(user_id).get("sync_interval_min") or 5), 1) * 60
        except Exception:
            interval = 300
        if time.time() - cached.get("deep_ts", 0) >= interval:
            cached["deep_ts"] = time.time()
            try:
                from app import user_accounts, sync_mailbox
                accts = user_accounts(user_id)
                if accts:
                    cached.pop("by_name", None)   # folder tree may have changed on server
                    sync_mailbox(user_id, accts[0])
            except Exception as e:
                logger.error(f"deep sync {user_id}: {e}")


def ensure_worker(user_id):
    if not _enabled:
        return
    with _hub_lock:
        cur = _watch.get(user_id)
        if cur and cur["thread"].is_alive():
            return
        w = {"stop": threading.Event()}
        t = threading.Thread(target=_loop, args=(user_id, w["stop"]), daemon=True,
                             name=f"realtime-{user_id}")
        w["thread"] = t
        _watch[user_id] = w
        t.start()
    logger.info(f"realtime worker started for user {user_id}")


def stop_worker(user_id):
    with _hub_lock:
        w = _watch.pop(user_id, None)
    if w:
        w["stop"].set()
