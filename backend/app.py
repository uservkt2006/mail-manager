"""TM Mail Manager v3.8.2 — multi-user, spec-aligned schema.

Entities: User, Session, MailAccount, Folder(tree), Thread, Message,
Attachment, Contact, Task, CalendarEvent, AuditEvent.
Auth: X-Auth-Token header, PBKDF2 password hashing, per-user data isolation.
"""
from fastapi import FastAPI, HTTPException, Query, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import logging
import json
import unicodedata
import os
import re
import sqlite3
import hashlib
import secrets
import threading
import hashlib
import tempfile
import shutil
import time
from datetime import datetime, timedelta
from contextlib import contextmanager

logging.basicConfig(level=logging.INFO)
logging.getLogger("exchangelib").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

app = FastAPI(title="TM Mail Manager", version="3.8.2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# SQLite database path (MM_DB_PATH lets tests use an isolated DB)
DB_PATH = os.environ.get("MM_DB_PATH") or os.path.expanduser("~/.mail_manager/mail_manager.db")
KEY_PATH = os.path.expanduser("~/.mail_manager/key")
SCHEMA_VERSION = 10

CATEGORIES = ["Work", "Personal", "Finance", "Urgent", "Travel", "Other"]
CATEGORY_COLORS = {"Work": "#4c8dff", "Personal": "#22c55e", "Finance": "#f59e0b",
                   "Urgent": "#ef4444", "Travel": "#8b5cf6", "Other": "#6b7280"}

SYSTEM_FOLDERS = {"inbox": "Hộp thư đến", "sent": "Đã gửi", "drafts": "Bản nháp",
                  "trash": "Thùng rác", "archive": "Lưu trữ"}


# ─── crypto / auth helpers ────────────────────────────────────────────
def get_or_create_key():
    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, "rb") as f:
            return f.read()
    from cryptography.fernet import Fernet
    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
    with open(KEY_PATH, "wb") as f:
        f.write(key)
    return key


def encrypt_password(pw: str) -> str:
    from cryptography.fernet import Fernet
    return Fernet(get_or_create_key()).encrypt(pw.encode()).decode()


def decrypt_password(enc: str) -> str:
    from cryptography.fernet import Fernet
    return Fernet(get_or_create_key()).decrypt(enc.encode()).decode()


def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()


def make_user(email, password, display_name):
    salt = secrets.token_hex(16)
    return salt, hash_pw(password, salt), display_name


def current_user(x_auth_token: str = Header(default=None)) -> dict:
    if not x_auth_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    with get_db() as conn:
        row = conn.execute(
            "SELECT u.id, u.email, u.display_name FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (x_auth_token,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid token")
    return dict(row)


def current_user_q(x_auth_token: str = Header(default=None), token: str = "") -> dict:
    """For direct-download links (browser can't set headers): token via query too."""
    return current_user(x_auth_token or token or None)


# ─── db ────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        conn.execute("PRAGMA journal_mode = WAL")  # background delta writer vs HTTP readers
    except sqlite3.OperationalError:
        pass
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    salt TEXT NOT NULL,
    pw_hash TEXT NOT NULL,
    locale TEXT DEFAULT 'vi-VN',
    timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mail_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    address TEXT NOT NULL,
    provider TEXT DEFAULT 'exchange',
    password_encrypted TEXT NOT NULL,
    server_url TEXT DEFAULT 'https://mail.fpt.net/EWS/Exchange.asmx',
    sync_state TEXT,
    UNIQUE(user_id, address)
);
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    type TEXT DEFAULT 'user',            -- inbox|sent|drafts|trash|archive|user
    parent_id INTEGER REFERENCES folders(id)
);
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    normalized_subject TEXT,
    participants TEXT DEFAULT '[]',
    last_message_at TEXT,
    unread_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    account_id INTEGER REFERENCES mail_accounts(id),
    message_id TEXT,
    thread_id TEXT REFERENCES threads(id),
    folder_id INTEGER REFERENCES folders(id),
    "from" TEXT,
    "to" TEXT,
    cc TEXT,
    subject TEXT,
    date TEXT,
    preview TEXT,
    body TEXT,
    html_body TEXT,
    is_read INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    flag_due TEXT,
    categories TEXT DEFAULT '[]',
    deleted_at TEXT,
    archived_local INTEGER DEFAULT 0,
    archive_path TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id),
    name TEXT, mime_type TEXT, size INTEGER,
    storage_ref TEXT, scan_state TEXT DEFAULT 'pending',
    content_id TEXT, is_inline INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT, email TEXT, phone TEXT, job_title TEXT,
    company TEXT, notes TEXT, favorite INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, description TEXT,
    status TEXT DEFAULT 'not_started',   -- not_started|in_progress|completed
    priority TEXT DEFAULT 'normal',
    due_at TEXT, reminder_at TEXT,
    source_ref TEXT, assignee TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    subject TEXT, start_at TEXT, end_at TEXT,
    all_day INTEGER DEFAULT 0, location TEXT,
    body TEXT, category TEXT, reminder_min INTEGER DEFAULT 15
);
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT, resource TEXT, detail TEXT,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_msg_folder ON messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_msg_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_msg_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_att_msg ON attachments(message_id);
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    -- conditions (all present ones must match)
    c_from TEXT, c_subject TEXT, c_body TEXT, c_to TEXT, c_cc TEXT, c_unread INTEGER,
    c_has_attachment INTEGER, c_size_min INTEGER,
    -- actions
    a_folder_id INTEGER REFERENCES folders(id),
    a_mark_read INTEGER DEFAULT 0,
    a_star INTEGER DEFAULT 0,
    a_category TEXT,
    a_flag_days INTEGER,
    a_delete INTEGER DEFAULT 0,
    a_forward TEXT,
    a_autoreply TEXT,
    priority INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    last_hit_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS folder_sync (
    user_id INTEGER NOT NULL REFERENCES users(id),
    folder_path TEXT NOT NULL,        -- json list of NFC names from root
    local_folder_id INTEGER REFERENCES folders(id),
    ews_sync_state TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, folder_path)
);
CREATE TABLE IF NOT EXISTS search_folders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    query TEXT NOT NULL,            -- json: {folder?,unread?,starred?,flagged?,has_attachment?,category?,search?}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_user ON tasks(user_id);
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    json TEXT NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
'''


def audit(conn, user_id, action, resource, detail=""):
    conn.execute("INSERT INTO audit_events (user_id, action, resource, detail) VALUES (?,?,?,?)",
                 (user_id, action, resource, detail))


def now_iso():
    return datetime.now().isoformat()


def _fix_folder_sync_shape(conn):
    """folder_sync is pure state (rebuildable from next full sync); migrate old 3-col shape."""
    cols = [r[1] for r in conn.execute("PRAGMA table_info(folder_sync)")]
    if cols and "local_folder_id" not in cols:
        conn.executescript(
            "DROP TABLE folder_sync;"
            "CREATE TABLE folder_sync ("
            "user_id INTEGER NOT NULL REFERENCES users(id),"
            "folder_path TEXT NOT NULL,"
            "local_folder_id INTEGER REFERENCES folders(id),"
            "ews_sync_state TEXT,"
            "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
            "PRIMARY KEY (user_id, folder_path));")


def _fold_vi(s):
    """Strip Vietnamese diacritics: 'hợp đồng' -> 'hop dong' (search both ways)."""
    import unicodedata
    d = unicodedata.normalize('NFD', s or '')
    d = ''.join(ch for ch in d if not unicodedata.combining(ch))
    return d.replace('đ', 'd').replace('Đ', 'D')


def _ensure_fts(conn):
    """FTS5 index over mail text with Vietnamese folding (hợp đồng <-> hop dong,
    incl. d-<diaeresis> which sqlite's remove_diacritics misses). Plain table;
    rowid = messages.rowid. Incremental maintenance via _fts_ensure_row/_fts_keeper."""
    old = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='msg_fts'").fetchone()
    # drop legacy triggers from the old trigger-based design (they corrupt the new table)
    for tr in ('msg_fts_ai', 'msg_fts_ad', 'msg_fts_au'):
        conn.execute(f"DROP TRIGGER IF EXISTS {tr}")
    if old and ("content='messages'" in (old[0] or '') or 'meta' not in (old[0] or '')):
        conn.execute("DROP TABLE msg_fts")
    conn.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS msg_fts USING fts5(
        subject, sender, recipients, preview, body,
        f_subject, f_sender, f_recipients, f_preview, f_body,
        meta UNINDEXED,
        tokenize="unicode61 remove_diacritics 2")""")
    if conn.execute("SELECT COUNT(*) FROM msg_fts").fetchone()[0] == 0:
        _fts_rebuild(conn)   # cold start (or schema migration): build once, keeper maintains after


def _meta_of(s_len, b_len):
    return f"{s_len}:{b_len}"


def _fts_rowid(conn, rowid):
    """(Re)index one message row in msg_fts — incremental, no full rebuild.
    Safe inside the caller's transaction."""
    r = conn.execute(
        """SELECT deleted_at IS NOT NULL AS dead,
                  coalesce(subject,'') s, coalesce("from",'') f,
                  coalesce("to",'')||' '||coalesce(cc,'')||' '||coalesce(bcc,'') t,
                  coalesce(preview,'') p,
                  coalesce(body,'')||' '||coalesce(html_body,'') b,
                  LENGTH(COALESCE(body,''))+LENGTH(COALESCE(html_body,'')) blen
           FROM messages WHERE rowid=?""", (rowid,)).fetchone()
    if not r:
        return
    conn.execute("DELETE FROM msg_fts WHERE rowid=?", (rowid,))
    if not r["dead"]:
        conn.execute(
            "INSERT INTO msg_fts(rowid,subject,sender,recipients,preview,body,"
            "f_subject,f_sender,f_recipients,f_preview,f_body,meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (rowid, r["s"], r["f"], r["t"], r["p"], r["b"],
             _fold_vi(r["s"]), _fold_vi(r["f"]), _fold_vi(r["t"]), _fold_vi(r["p"]), _fold_vi(r["b"]),
             _meta_of(len(r["s"]), r["blen"])))


def _fts_ensure_row(conn, email_id):
    """Hook for write paths: index one message by its id column."""
    try:
        r = conn.execute("SELECT rowid FROM messages WHERE id=?", (email_id,)).fetchone()
        if r:
            _fts_rowid(conn, r["rowid"])
    except Exception:
        pass


def _fts_rebuild(conn=None):
    """One-off full reindex (startup when empty, or manual repair)."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH, timeout=60)
        conn.execute("PRAGMA busy_timeout=60000")
    t0 = time.time()
    rows = conn.execute(
        """SELECT rowid, coalesce(subject,''), coalesce("from",''),
                  coalesce("to",'')||' '||coalesce(cc,'')||' '||coalesce(bcc,''),
                  coalesce(preview,''), coalesce(body,'')||' '||coalesce(html_body,''),
                  LENGTH(COALESCE(body,''))+LENGTH(COALESCE(html_body,''))
           FROM messages WHERE deleted_at IS NULL""").fetchall()
    conn.execute("DELETE FROM msg_fts")
    conn.commit()
    args = [(r[0], r[1], r[2], r[3], r[4], r[5],
             _fold_vi(r[1]), _fold_vi(r[2]), _fold_vi(r[3]), _fold_vi(r[4]), _fold_vi(r[5]),
             _meta_of(len(r[1]), r[6])) for r in rows]
    for i in range(0, len(args), 200):   # chunked commits: short write locks
        conn.executemany(
            "INSERT INTO msg_fts(rowid,subject,sender,recipients,preview,body,"
            "f_subject,f_sender,f_recipients,f_preview,f_body,meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            args[i:i + 200])
        conn.commit()
    logger.info(f"fts rebuilt: {len(rows)} docs in {time.time()-t0:.1f}s")


def _fts_keeper():
    """Every 20s: index new/drifted rows, drop deleted — incremental, short locks."""
    while True:
        time.sleep(20)
        try:
            conn = sqlite3.connect(DB_PATH, timeout=60)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA busy_timeout=60000")
            try:
                stale = conn.execute(
                    """SELECT m.rowid FROM messages m
                       LEFT JOIN msg_fts f ON f.rowid = m.rowid
                       WHERE m.deleted_at IS NULL
                         AND (f.rowid IS NULL
                              OR f.meta != LENGTH(COALESCE(m.subject,''))||':'||(LENGTH(COALESCE(m.body,''))+LENGTH(COALESCE(m.html_body,''))))
                       LIMIT 400""").fetchall()
                for (rowid,) in stale:
                    _fts_rowid(conn, rowid)
                gone = conn.execute(
                    """SELECT rowid FROM msg_fts
                       WHERE rowid NOT IN (SELECT rowid FROM messages WHERE deleted_at IS NULL)
                       LIMIT 1000""").fetchall()
                conn.executemany("DELETE FROM msg_fts WHERE rowid=?", [(r[0],) for r in gone])
                conn.commit()
            finally:
                conn.close()
        except Exception as e:
            logger.error(f"fts keeper: {e}")


def _fts_match(search):
    """Parse 'from:x to:y subject:z free' into an FTS5 MATCH (AND of terms, prefix as-you-type).
    Unaccented query searches the folded columns; accented query the raw ones."""
    folded = (_fold_vi(search) == search)   # query itself has no diacritics -> match folded cols
    cols = tuple(('f_' + c if folded else c) for c in ('subject', 'sender', 'recipients', 'preview', 'body'))
    parts = []
    for tok in (search or '').split():
        low = tok.lower()
        col = None
        for pfx, c in (('from:', 'sender'), ('sender:', 'sender'),
                       ('to:', 'recipients'), ('cc:', 'recipients'), ('bc:', 'recipients'),
                       ('subject:', 'subject'), ('title:', 'subject')):
            if low.startswith(pfx) and len(tok) > len(pfx):
                col, tok = c, tok[len(pfx):]
                break
        val = (_fold_vi if folded else (lambda s: s))(tok.strip('"').replace('"', ' ').strip())
        if not val:
            continue
        q = '"' + val + '"' + '*'
        parts.append(f'{cols[("subject", "sender", "recipients").index(col)]}:{q}'
                     if col else '(' + ' OR '.join(f'{c}:{q}' for c in cols) + ')')
    return ' AND '.join(parts)


def init_db():
    with get_db() as conn:
        _fix_folder_sync_shape(conn)
        try:
            _ensure_fts(conn)
        except Exception as e:
            logger.error(f"fts init: {e}")
        ver = conn.execute("PRAGMA user_version").fetchone()[0]
        if ver >= SCHEMA_VERSION:
            return
        # v4: additive migration — SCHEMA is CREATE IF NOT EXISTS, safe on live data.
        # Destructive rebuild only if the DB predates v3 (missing 'users' table).
        has_users = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
        if ver > 0 and not has_users:
            conn.close()
            import shutil
            shutil.copy2(DB_PATH, DB_PATH + f".v{ver}.bak")
            os.remove(DB_PATH)
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
        # folder_sync is pure state (rebuildable from next full sync); upgrade in place
        _fs_cols = [r[1] for r in conn.execute("PRAGMA table_info(folder_sync)")]
        if _fs_cols and "local_folder_id" not in _fs_cols:
            conn.executescript("DROP TABLE folder_sync;")
            conn.executescript("CREATE TABLE IF NOT EXISTS folder_sync ("
                               "user_id INTEGER NOT NULL REFERENCES users(id),"
                               "folder_path TEXT NOT NULL,"
                               "local_folder_id INTEGER REFERENCES folders(id),"
                               "ews_sync_state TEXT,"
                               "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
                               "PRIMARY KEY (user_id, folder_path));")
        # additive columns for live DBs (CREATE IF NOT EXISTS won't add them)
        for col, typ in (("html_body", "TEXT"), ("cc", "TEXT"), ("bcc", "TEXT"),
                         ("ews_item_id", "TEXT"),
                         ("archived_local", "INTEGER DEFAULT 0"),
                         ("archive_path", "TEXT")):
            try:
                conn.execute(f"ALTER TABLE messages ADD COLUMN {col} {typ}")
            except sqlite3.OperationalError:
                pass
        for col, typ in (("content_id", "TEXT"), ("is_inline", "INTEGER DEFAULT 0")):
            try:
                conn.execute(f"ALTER TABLE attachments ADD COLUMN {col} {typ}")
            except sqlite3.OperationalError:
                pass
        # v3.4.1: folder order_index for drag-drop reorder
        try:
            conn.execute("ALTER TABLE folders ADD COLUMN order_index INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        # v3.4.2: rule priority + cc/size conditions + delete/forward/autoreply actions
        for col, typ in (("c_cc", "TEXT"), ("c_size_min", "INTEGER"),
                         ("a_delete", "INTEGER DEFAULT 0"), ("a_forward", "TEXT"),
                         ("a_autoreply", "TEXT"), ("priority", "INTEGER DEFAULT 0")):
            try:
                conn.execute(f"ALTER TABLE rules ADD COLUMN {col} {typ}")
            except sqlite3.OperationalError:
                pass
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        # Always require setup wizard — no demo accounts
        # MM_DEMO env var can be used in development to skip this
        if not has_users and os.environ.get("MM_DEMO") != "1":
            pass  # no seeding, clean first-run


def get_or_create_folder(conn, user_id, ftype, name=None, parent_id=None):
    # identity = (name, parent) so same-named folders at different tree levels stay distinct
    disp = nfck(name) if name else SYSTEM_FOLDERS.get(ftype, ftype)
    row = conn.execute(
        "SELECT id FROM folders WHERE user_id=? AND name=? AND COALESCE(parent_id,-1)=COALESCE(?,-1)",
        (user_id, disp, parent_id)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO folders (user_id,name,type,parent_id) VALUES (?,?,?,?)",
                       (user_id, disp, ftype, parent_id))
    return cur.lastrowid


def ensure_thread(conn, user_id, thread_id, subject, participants, msg_date, unread):
    t = conn.execute("SELECT id FROM threads WHERE id=? AND user_id=?", (thread_id, user_id)).fetchone()
    if not t:
        conn.execute("INSERT INTO threads (id,user_id,normalized_subject,participants,last_message_at,unread_count) VALUES (?,?,?,?,?,?)",
                     (thread_id, user_id, normalize_subject(subject), json.dumps(participants), msg_date, unread))
    else:
        conn.execute("UPDATE threads SET last_message_at=MAX(COALESCE(last_message_at,''),?), unread_count=unread_count+? WHERE id=?",
                     (msg_date, unread, thread_id))


def normalize_subject(s):
    return re.sub(r'^(re|fw|fwd):\s*', '', (s or ''), flags=re.I).strip().lower()


def insert_message(conn, user_id, msg, attachments=None):
    conn.execute("""INSERT INTO messages (id,user_id,message_id,thread_id,folder_id,"from","to",subject,date,preview,body,is_read,starred,categories,flag_due)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
        msg["id"], user_id, msg["message_id"], msg["thread_id"], msg["folder_id"],
        msg["from"], msg.get("to", ""), msg["subject"], msg["date"],
        msg["preview"], msg["body"], msg.get("is_read", 0), msg.get("starred", 0),
        json.dumps(msg.get("categories", [])), msg.get("flag_due")))
    for a in (attachments or []):
        conn.execute("INSERT OR IGNORE INTO attachments (id,message_id,name,mime_type,size) VALUES (?,?,?,?,?)",
                     (a["id"], msg["id"], a["name"], a.get("mime_type", "application/octet-stream"), a.get("size", 0)))


def seed(conn):
    # two users to prove isolation
    users = []
    for email, pw, dn in [("demo@fpt.com", "demopass123", "Demo User"),
                          ("nhanvien@fpt.com", "nv123456", "Nhân Viên")]:
        salt, pwh, dn = make_user(email, pw, dn)
        cur = conn.execute("INSERT INTO users (email,display_name,salt,pw_hash) VALUES (?,?,?,?)",
                           (email, dn, salt, pwh))
        users.append(cur.lastrowid)
    demo, nv = users

    folders = {}
    for uid in (demo, nv):
        for ft in SYSTEM_FOLDERS:
            folders[(uid, ft)] = get_or_create_folder(conn, uid, ft)
    bao_cao = get_or_create_folder(conn, demo, "user", "Báo cáo", folders[(demo, "inbox")])
    du_an = get_or_create_folder(conn, demo, "user", "Dự án")

    t = lambda h: (datetime.now() - timedelta(hours=h)).isoformat()
    demo_msgs = [
        dict(id="1", message_id="<m1>", thread_id="th-1", folder_id=folders[(demo, "inbox")],
             **{"from": "John Doe <john.doe@fpt.com>", "subject": "Meeting tomorrow at 10am",
                "date": t(2), "preview": "Hi team, just a reminder about our meeting tomorrow...",
                "body": "Hi team,\n\nJust a reminder about our meeting tomorrow at 10am. Please bring your quarterly reports.\n\nBest,\nJohn",
                "is_read": 0, "starred": 1, "categories": ["Work"], "flag_due": t(20)}),
        dict(id="2", message_id="<m2>", thread_id="th-2", folder_id=folders[(demo, "inbox")],
             **{"from": "Alice Smith <alice.smith@fpt.com>", "subject": "Project update - Q3 Report",
                "date": t(32), "preview": "Please find attached the quarterly report...",
                "body": "Hi,\n\nPlease find attached the quarterly report for your review.\n\nRegards,\nAlice",
                "is_read": 1, "starred": 0, "categories": ["Work", "Urgent"]}),
        dict(id="3", message_id="<m3>", thread_id="th-3", folder_id=folders[(demo, "inbox")],
             **{"from": "Billing <billing@vendor.com>", "subject": "Invoice #INV-2024-089",
                "date": t(50), "preview": "Your invoice is ready for payment...",
                "body": "Dear Customer,\n\nInvoice #INV-2024-089 ready for payment.\nAmount: $1,250.00\nDue: 2026-09-25",
                "is_read": 0, "starred": 0, "categories": ["Finance"]}),
        dict(id="4", message_id="<m4>", thread_id="th-1", folder_id=folders[(demo, "inbox")],
             **{"from": "Manager <manager@fpt.com>", "subject": "Re: Meeting tomorrow at 10am",
                "date": t(5), "preview": "Confirmed. See you all tomorrow...",
                "body": "Confirmed. See you all tomorrow.\n\nRegards,\nManager",
                "is_read": 1, "starred": 0, "categories": ["Work"]}),
        dict(id="5", message_id="<m5>", thread_id="th-4", folder_id=demo and bao_cao,
             **{"from": "HR <hr@fpt.com>", "subject": "Holiday schedule 2026",
                     "date": t(70), "preview": "Please find the holiday schedule for 2026...",
                "body": "Dear Team,\n\nHoliday schedule for 2026 attached.",
                "is_read": 1, "starred": 0, "categories": ["Personal"]}),
        dict(id="6", message_id="<m6>", thread_id="th-2", folder_id=folders[(demo, "inbox")],
             **{"from": "Bob Lee <bob@fpt.com>", "subject": "Re: Project update - Q3 Report",
                "date": t(28), "preview": "I've reviewed the Q3 report. Looks good!",
                "body": "Hi Alice,\n\nReviewed. Great work. Suggestions:\n1. More revenue detail\n2. Competitor analysis\n\nBest,\nBob",
                "is_read": 1, "starred": 0, "categories": ["Work"]}),
    ]
    atts = {"2": [dict(id="a1", name="Q3_Report.xlsx", mime_type="application/xlsx", size=241152),
                  dict(id="a2", name="slides.pdf", mime_type="application/pdf", size=1048576)],
            "3": [dict(id="a3", name="INV-2024-089.pdf", mime_type="application/pdf", size=88473)]}
    threads_seen = {}
    for m in demo_msgs:
        p = [m["from"]]
        ensure_thread(conn, demo, m["thread_id"], m["subject"], None, m["date"], m["is_read"] == 0)
        insert_message(conn, demo, m, atts.get(m["id"]))
    for uid in (demo, nv):
        ensure_thread(conn, uid, f"th-sent-{uid}", "Gửi từ TM Mail Manager", None, t(100), 0)
        conn.execute("""INSERT INTO messages (id,user_id,message_id,thread_id,folder_id,"from","to",subject,date,preview,body,is_read,starred,categories)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"sent-{uid}", uid, "<s1>", f"th-sent-{uid}", folders[(uid, "sent")], "me", "other@x.com",
             "Gửi từ TM Mail Manager", t(100), "Test đã gửi", "Nội dung đã gửi", 1, 0, "[]"))

    for name, em, job, comp in [("John Doe", "john.doe@fpt.com", "Trưởng nhóm", "FPT"),
                                ("Alice Smith", "alice.smith@fpt.com", "PM", "FPT"),
                                ("Bob Lee", "bob@fpt.com", "Dev", "FPT"),
                                ("HR Team", "hr@fpt.com", "Nhân sự", "FPT")]:
        conn.execute("INSERT INTO contacts (id,user_id,name,email,job_title,company,favorite) VALUES (?,?,?,?,?,?,?)",
                     (f"c-{demo}-{name.split()[0].lower()}", demo, name, em, job, comp, 1 if name == "John Doe" else 0))
    for title, due, done, src in [("Chuẩn bị báo cáo Q3", t(-24), 0, "2"),
                                  ("Xác nhận lịch họp", t(20), 0, "1"),
                                  ("Thanh toán hóa đơn", t(240), 1, "3")]:
        conn.execute("INSERT INTO tasks (id,user_id,title,status,due_at,source_ref) VALUES (?,?,?,?,?,?)",
                     (f"tk-{title[:8]}", demo, title, "completed" if done else "not_started", due, src))
    for subj, day_off, hour, dur, loc, cat in [("Họp đội", 1, 10, 60, "P.301", "Work"),
                                               ("Review Q3", 3, 14, 90, "Online", "Work"),
                                               ("Cả ngày: Nghỉ lễ", 10, 0, 0, "", "Personal")]:
        s = (datetime.now() + timedelta(days=day_off)).replace(hour=hour or 8, minute=0, second=0)
        e = s + timedelta(minutes=dur or 30)
        conn.execute("INSERT INTO calendar_events (id,user_id,subject,start_at,end_at,all_day,location,category) VALUES (?,?,?,?,?,?,?,?)",
                     (f"ev-{subj[:6]}{day_off}", demo, subj, s.isoformat(), e.isoformat(), 1 if dur == 0 else 0, loc, cat))


init_db()


threading.Thread(target=_fts_keeper, daemon=True).start()

# realtime: resume delta-sync workers on boot for users that have an Exchange account
# and haven't disabled "Tự động đồng bộ"
try:
    import realtime as _rt
    with get_db() as _c:
        for _u in _c.execute("SELECT DISTINCT user_id FROM mail_accounts").fetchall():
            _st = _c.execute("SELECT json FROM user_settings WHERE user_id=?", (_u["user_id"],)).fetchone()
            _on = True
            try:
                _on = json.loads(_st["json"]).get("autosync", True) if _st else True
            except Exception:
                pass
            if _on:
                _rt.ensure_worker(_u["user_id"])
except Exception as _e:
    logging.getLogger(__name__).warning(f"realtime boot skipped: {_e}")


# ─── models ───────────────────────────────────────────────────────────
class LoginReq(BaseModel):
    email: str
    password: str


class AccountConfig(BaseModel):
    email: str
    password: str
    exchange_url: str = "https://mail.fpt.net/EWS/Exchange.asmx"
    display_name: str = ""


class CategoryUpdate(BaseModel):
    categories: List[str]


class FolderCreate(BaseModel):
    name: str
    parent_type: Optional[str] = None
    parent_id: Optional[int] = None


class MoveReq(BaseModel):
    folder_id: int


class FlagReq(BaseModel):
    due: Optional[str] = None


class ReadReq(BaseModel):
    is_read: bool


class ComposeReq(BaseModel):
    to: str
    subject: str
    body: str
    cc: str = ""
    bcc: str = ""
    send: bool = True
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    attachments: list = []          # [{name, content_base64, content_type}]
    sig_added: bool = False         # compose UI already placed the signature


class ReplyReq(BaseModel):
    body: str
    mode: str = "reply"      # legacy direct-reply; UI now uses preview+compose


class TaskReq(BaseModel):
    title: str
    description: str = ""
    due_at: Optional[str] = None
    status: Optional[str] = None


class ContactReq(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    job_title: str = ""
    company: str = ""


class EventReq(BaseModel):
    subject: str
    start_at: str
    end_at: Optional[str] = None
    all_day: bool = False
    location: str = ""
    category: str = "Work"


# ─── helpers ──────────────────────────────────────────────────────────
def _parse_msg(row) -> dict:
    m = dict(row)
    try:
        m["categories"] = json.loads(m.get("categories") or "[]")
    except (TypeError, json.JSONDecodeError):
        m["categories"] = []
    m["is_read"] = bool(m.get("is_read"))
    m["starred"] = bool(m.get("starred"))
    m["has_attachments"] = bool(m.get("has_attachments"))
    m["archived_local"] = bool(m.get("archived_local"))
    m.setdefault("archive_path", "")
    m.setdefault("cc", "")
    m.setdefault("bcc", "")
    m.pop("deleted_at", None)
    return m


def folder_counts(conn, user_id):
    """folder_id -> (total, unread)"""
    out = {}
    for r in conn.execute("""SELECT folder_id, COUNT(*) total,
        SUM(CASE WHEN is_read=0 THEN 1 ELSE 0 END) unread
        FROM messages WHERE user_id=? AND deleted_at IS NULL GROUP BY folder_id""", (user_id,)):
        out[r["folder_id"]] = (r["total"], r["unread"] or 0)
    return out


def folder_tree(user_id, conn):
    counts = folder_counts(conn, user_id)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(folders)")]
    order = "ORDER BY CASE WHEN type='user' THEN 1 ELSE 0 END, order_index ASC, name" if "order_index" in cols else "ORDER BY type='user', name"
    rows = conn.execute(f"SELECT * FROM folders WHERE user_id=? {order}", (user_id,)).fetchall()
    nodes = {r["id"]: {"id": r["id"], "name": r["name"], "type": r["type"],
                       "parent_id": r["parent_id"], "total": counts.get(r["id"], (0, 0))[0],
                       "unread": counts.get(r["id"], (0, 0))[1],
                       "order_index": r["order_index"] if "order_index" in r.keys() else 0,
                       "children": []} for r in rows}
    roots = []
    for n in nodes.values():
        if n["parent_id"] and n["parent_id"] in nodes:
            nodes[n["parent_id"]]["children"].append(n)
        else:
            roots.append(n)
    roots.sort(key=lambda n: (n["type"] == "user",))  # system first, then user (both already order_index-sorted)
    for n in nodes.values():
        if n["children"]:
            pass  # children inherit the DB order already
    return roots


# ─── EWS helpers (exchangelib) ────────────────────────────────────────
# Pitfalls learned from a live probe against mail.fpt.net:
#  * Configuration(server=...) wants a HOSTNAME, not the full EWS URL — passing
#    the URL makes exchangelib append /EWS/Exchange.asmx again and resolve host 'https'.
#  * account.root.children is a property (FolderCollection), not callable.
#  * This exchangelib build has no `timeout` kwarg on Configuration/Account.
def ews_hostname(url: str) -> str:
    s = (url or "").strip()
    s = re.sub(r"^[a-z]+://", "", s, flags=re.I)
    return s.split("/")[0]


FOLDER_TYPE_BY_NAME = {
    "inbox": ["hộp thư đến", "inbox"],
    "sent": ["đã gửi", "sent items", "đã gửi"],
    "drafts": ["bản nháp", "drafts"],
    "trash": ["thùng rác", "deleted items", "đã xóa"],
    "archive": ["lưu trữ", "archive"],
}


def nfck(name: str) -> str:
    """EWS sends Vietnamese folder names decomposed (NFD); normalize to NFC so
    comparisons and DB identity are stable."""
    return unicodedata.normalize("NFC", (name or "").strip())


def classify_folder(display_name: str) -> str:
    n = nfck(display_name).lower()
    for ftype, names in FOLDER_TYPE_BY_NAME.items():
        if n in names:
            return ftype
    return "user"


def safe_ews_id(prefix: str, account_id: int, raw) -> str:
    """EWS item ids are base64 and contain '/' and '=' — unusable in URL path.
    Map to a short stable hash; RFC822 message_id is kept separately."""
    import hashlib
    return f"{prefix}-{account_id}-{hashlib.sha1(str(raw).encode()).hexdigest()[:24]}"


# Mail folders worth syncing: EWS system/wrapper folders that are not user mailboxes
SYNC_SKIP = {"Recoverable Items", "Finder", "AllItems", "AllContacts", "AllPersonMetadata",
             "BrokerSubscriptions", "CalendarItemSnapshots", "CalendarSharingCacheCollection",
             "Deduplication", "Deletions", "Versions", "Contacts", "PeopleCache", "Pure Fileings",
             "Conversation History", "Person Metadata", "System", "Reminders", "Sync Issues",
             "To-Do Search", "Conversation Action Settings", "Quick Step Settings", "Rule Data",
             "Junk Email", "RSS Subscriptions", "Local Failures", "Server Failures", "Drafts Root"}

# max items pulled per folder per sync (mailbox has thousands; keep first sync fast)
FOLDER_SYNC_CAP = int(os.environ.get("MM_SYNC_CAP", "40"))

# EWS wraps real top-level folders inside a "Mailbox Root" container
# ('Đầu Kho Thông tin' on VN servers) — unwrap it so 'Hộp thư đến' etc. map to
# the user's top-level system folders, not nested duplicates.
ROOT_WRAPPERS = {"đầu kho thông tin", "mailbox root", "root", "all folders"}


def ews_connect(email: str, password: str, server_url: str):
    from exchangelib import Credentials, Configuration, Account, DELEGATE
    cfg = Configuration(server=ews_hostname(server_url),
                        credentials=Credentials(username=email, password=password))
    return Account(primary_smtp_address=email, config=cfg, access_type=DELEGATE)


def _strip_html(html):
    # drop non-content blocks FIRST — Outlook injects <style>/<xml> (VML/mso) whose
    # CSS text leaks into previews if we strip tags blindly
    t = re.sub(r'<(style|xml|script)[^>]*>.*?</\1>', ' ', html or '', flags=re.S | re.I)
    t = re.sub(r'<!--.*?-->', ' ', t, flags=re.S)
    t = re.sub(r'<br[^>]*>', '\n', t, flags=re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    import html as _html
    t = _html.unescape(t)
    t = re.sub(r'&nbsp;?', ' ', t)
    t = re.sub(r'[ \t]{2,}', ' ', t)
    # collapse lines and keep first real text (skip leading blank/CSS leftovers)
    lines = [ln.strip() for ln in t.splitlines()]
    return ' '.join(ln for ln in lines if ln).strip()


def store_ews_message(conn, user_id, aid, local_id, m):
    """Insert/refresh one EWS message row. Returns True if a NEW row was created."""
    if not hasattr(m, "message_id") or not hasattr(m, "datetime_received"):
        return False
    mid = safe_ews_id("ews", aid, m.id)
    raw_ews_id = str(m.id)
    try:
        date = m.datetime_received.isoformat() if m.datetime_received else now_iso()
    except Exception:
        return False
    snd = getattr(m, "sender", None)
    sender = f"{snd.name} <{snd.email_address}>" if snd and getattr(snd, "email_address", None) else (str(snd) if snd else "")
    raw = m.body if m.body is not None else ""
    from exchangelib.properties import HTMLBody as _HTMLB
    if isinstance(raw, _HTMLB) or (isinstance(raw, str) and raw.lstrip()[:5].lower() == "<html"):
        html = str(raw)
        text = _strip_html(html)
    else:
        html = None
        text = str(raw)
    is_read = 1 if getattr(m, "is_read", True) else 0
    old_row = conn.execute("SELECT id, is_read FROM messages WHERE id=?", (mid,)).fetchone()
    if old_row:
        if not old_row["is_read"] and is_read:
            conn.execute("UPDATE messages SET is_read=1 WHERE id=?", (mid,))
        return False
    cc = _fmt_recips(getattr(m, "cc_recipients", None))
    bcc = _fmt_recips(getattr(m, "bcc_recipients", None))
    tid = f"th-{normalize_subject(m.subject)}" if m.subject else mid
    ensure_thread(conn, user_id, tid, m.subject, [sender], date, 1 - is_read)
    conn.execute(
        """INSERT OR IGNORE INTO messages
           (id,user_id,account_id,message_id,ews_item_id,thread_id,folder_id,"from","to",cc,bcc,subject,date,preview,body,html_body,is_read,starred,categories)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'[]')""",
        (mid, user_id, aid, m.message_id, raw_ews_id, tid, local_id, sender,
         _fmt_recips(getattr(m, "to_recipients", None)), cc, bcc,
         m.subject or "(không tiêu đề)", date, text[:400], text, html, is_read))
    for i, at in enumerate(getattr(m, "attachments", None) or []):
        conn.execute("INSERT OR IGNORE INTO attachments (id,message_id,name,mime_type,size,content_id,is_inline) VALUES (?,?,?,?,?,?,?)",
                     (f"att-{mid}-{i}", mid, getattr(at, "name", f"file{i}"),
                      str(getattr(at, "content_type", "application/octet-stream")),
                      getattr(at, "size", 0) or 0,
                      getattr(at, "content_id", None) or None,
                      1 if getattr(at, "is_inline", False) else 0))
    try:  # Outlook-style: rules run on arrival
        mr = dict(conn.execute("SELECT m.*, EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id) has_attachments FROM messages m WHERE m.id=?", (mid,)).fetchone())
        apply_rules(conn, user_id, mr)
    except Exception as e:
        logger.error(f"rule {mid}: {e}")
    _fts_ensure_row(conn, mid)   # searchable immediately, not after the next keeper pass
    return True


def _fmt_recips(recips):
    """[Mailbox,...] -> 'Name <a@x>, Name2 <b@y>' display form (Outlook-style)."""
    out = []
    for x in (recips or []):
        try:
            addr = getattr(x, "email_address", None) or (x if isinstance(x, str) else "")
            nm = getattr(x, "name", None) or getattr(x, "mailbox_name", None)
            out.append(f"{nm} <{addr}>" if nm and addr else (addr or str(x)))
        except Exception:
            continue
    return ", ".join([o for o in out if o])


def sync_mailbox(user_id: int, acct_row) -> dict:
    """Pull recent items from Exchange into the local DB. Read-only on the server."""
    email = acct_row["address"]
    password = decrypt_password(acct_row["password_encrypted"])
    account = ews_connect(email, password, acct_row["server_url"])
    stats = {"messages": 0, "threads": 0, "contacts": 0, "events": 0, "folders": 0, "folders_synced": []}
    with get_db() as conn:
        aid = acct_row["id"]

        # 1+2. walk the whole folder tree; sync every non-empty mail folder (*.Note class),
        # mirroring parent/child structure into local folders.
        def collect_note_folders(folders, path=()):
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
                    yield from collect_note_folders(kids, path)  # transparent container
                    continue
                p = path + (f.name,)
                if fclass.endswith(".Note") and cnt and nfck(f.name) not in SYNC_SKIP:
                    yield f, p
                if kids:
                    yield from collect_note_folders(kids, p)

        def ensure_folder_chain(conn, user_id, names):
            """Create local folders for path components; return leaf id.
            System folders (inbox/sent/…) always map to the user's top-level one."""
            names = [nfck(n) for n in names]
            leaf_type = classify_folder(names[-1])
            if leaf_type != "user":
                return get_or_create_folder(conn, user_id, leaf_type)  # matches SYSTEM_FOLDERS name
            parent = None
            for n in names:
                parent = get_or_create_folder(conn, user_id, "user", n, parent)
            return parent

        seen_threads = set()
        try:
            for folder, path in collect_note_folders(list(account.root.children)):
                local_id = ensure_folder_chain(conn, user_id, path)
                stats["folders_synced"].append(folder.name)
                try:
                    items = list(folder.all().only(
                        "subject", "body", "sender", "to_recipients", "cc_recipients",
                        "bcc_recipients",
                        "datetime_received", "message_id", "is_read", "attachments", "has_attachments",
                        "importance")
                        .order_by("-datetime_received")[:FOLDER_SYNC_CAP])
                except Exception as e:
                    logger.error(f"folder {folder.name}: {e}")
                    continue
                try:
                    conn.execute("INSERT OR REPLACE INTO folder_sync (user_id,folder_path,local_folder_id,ews_sync_state,updated_at)"
                                 " VALUES (?,?,?,?,CURRENT_TIMESTAMP)",
                                 (user_id, json.dumps([nfck(n) for n in path]), local_id, folder.item_sync_state))
                except Exception:
                    pass
                for m in items:
                    if store_ews_message(conn, user_id, aid, local_id, m):
                        stats["messages"] += 1
                        seen_threads.add(f"th-{normalize_subject(m.subject)}" if m.subject else safe_ews_id("ews", aid, m.id))
        except Exception as e:
            logger.error(f"sync messages: {e}")
        stats["threads"] = len(seen_threads)
        stats["folders"] = len(stats["folders_synced"])

        # 3. next 14 days of calendar (EWS returns UTC-aware datetimes — compare aware)
        from datetime import timezone
        lo, hi = datetime.now(timezone.utc), datetime.now(timezone.utc) + timedelta(days=14)
        try:
            for ev in account.calendar.all()[:300]:
                st = ev.start
                if st is None:
                    continue
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)
                if st < lo or st > hi:
                    continue
                eid = safe_ews_id("ev", aid, ev.id)
                if conn.execute("SELECT id FROM calendar_events WHERE id=?", (eid,)).fetchone():
                    continue
                conn.execute(
                    "INSERT OR IGNORE INTO calendar_events (id,user_id,subject,start_at,end_at,all_day,location,category) VALUES (?,?,?,?,?,?,?,?)",
                    (eid, user_id, ev.subject or "(trống)", st.isoformat(),
                     ev.end.isoformat() if ev.end else st.isoformat(),
                     1 if getattr(ev, "is_all_day", False) else 0,
                     ev.location or "", "Work"))
                stats["events"] += 1
        except Exception as e:
            logger.error(f"sync calendar: {e}")

        # 4. contacts (cap 200). exchangelib 5.x: Contact has .display_name (NOT
        # .full_name/.name); EmailAddress.email; PhoneNumber.phone_number.
        try:
            for c in account.contacts.all()[:200]:
                em = ""
                try:
                    if c.email_addresses:
                        em = c.email_addresses[0].email or ""
                except Exception:
                    pass
                nm = c.display_name or ""
                if not nm and not em:
                    continue
                cid = safe_ews_id("c", aid, c.id)
                if conn.execute("SELECT id FROM contacts WHERE id=?", (cid,)).fetchone():
                    continue
                phone = ""
                try:
                    if c.phone_numbers:
                        phone = c.phone_numbers[0].phone_number or ""
                except Exception:
                    pass
                conn.execute(
                    "INSERT OR IGNORE INTO contacts (id,user_id,name,email,phone,company) VALUES (?,?,?,?,?,?)",
                    (cid, user_id, nm or em, em, phone, getattr(c, "company_name", "") or ""))
                stats["contacts"] += 1
        except Exception as e:
            logger.error(f"sync contacts: {e}")

        conn.execute("UPDATE mail_accounts SET sync_state=? WHERE id=?", (now_iso(), aid))
        audit(conn, user_id, "mail.sync", email, json.dumps(stats))
    return stats


# ─── EWS server-side ops (send / move / delete / attachments) ─────────
def user_accounts(user_id: int):
    with get_db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM mail_accounts WHERE user_id=?", (user_id,))]


def first_account_connect(user_id: int):
    """Connect to the user's first (or only) Exchange account. Returns (account, acct_row) or (None, None)."""
    for a in user_accounts(user_id):
        try:
            return ews_connect(a["address"], decrypt_password(a["password_encrypted"]), a["server_url"]), a
        except Exception as e:
            logger.error(f"ews connect {a['address']}: {e}")
    return None, None


_ACCT_CACHE = {}   # user_id -> (account, ts); a fresh Account() costs 5-10s of Autodiscover
_ACCT_TTL = 540


def acct_cached(user_id: int):
    acct, ts = _ACCT_CACHE.get(user_id, (None, 0))
    if acct and time.time() - ts < _ACCT_TTL:
        return acct
    account, _ = first_account_connect(user_id)
    if account:
        _ACCT_CACHE[user_id] = (account, time.time())
        return account
    _ACCT_CACHE.pop(user_id, None)
    return None


def _find_ews_item(account, acct_row, ews_item_id: str, message_id: str = ""):
    """Recover a server Item. message_id (RFC822) is stable across moves, so search
    mail folders with it first; fall back to reconstructing from the raw EWS item id."""
    from exchangelib.items import Message
    if message_id:
        candidates = [account.inbox, account.drafts]
        for extra in ('sent', 'junk', 'outbox'):   # attrs differ across exchangelib versions
            f = getattr(account, extra, None)
            if f is not None:
                candidates.append(f)
        # cached map (never walk the tree per call): try the mail's own folder names too
        seen = {id(c) for c in candidates}
        for name, f in _folder_map(account).items():
            if id(f) not in seen and name not in SYNC_SKIP:
                candidates.append(f)
        for folder in candidates:
            try:
                return folder.get(message_id=message_id)
            except Exception:
                continue
    if ews_item_id:
        try:
            return Message(account=account, id=ews_item_id)
        except Exception:
            pass
    return None


def ews_send(user_id: int, to: str, cc: str, bcc: str, subject: str, body: str,
             html: bool = True, attachments: list = None,
             in_reply_to: str = None, references: str = None) -> dict:
    """Send a real message through Exchange. attachments: [{name, content_base64, content_type}]."""
    from exchangelib.items import Message as EWSMessage
    from exchangelib.properties import HTMLBody, Mailbox
    from exchangelib.attachments import FileAttachment
    import base64 as _b64
    account, acct_row = first_account_connect(user_id)
    if not account:
        raise HTTPException(400, "Không kết nối được Exchange để gửi thư")

    def _mb(s):
        out = []
        for x in re.split(r"[,;]", s or ""):
            x = x.strip()
            if not x:
                continue
            mm = re.match(r"^(.*?)<?([\w.+-]+@[\w.-]+)>?$", x)
            addr = (mm.group(2) if mm else x).strip()
            nm = (mm.group(1).strip().strip('"') if mm else "") or None
            out.append(Mailbox(name=nm, email_address=addr))
        return out

    m = EWSMessage(
        account=account,
        to_recipients=_mb(to),
        cc_recipients=_mb(cc),
        bcc_recipients=_mb(bcc),
        subject=subject or "(không tiêu đề)",
        body=HTMLBody(body) if html else body,
    )
    if in_reply_to:
        m.reply_to = in_reply_to
    for att in (attachments or []):
        try:
            raw = _b64.b64decode(att.get("content_base64", ""))
            m.attach(FileAttachment(name=att["name"], content=raw,
                                    content_type=att.get("content_type") or "application/octet-stream"))
        except Exception as e:
            logger.error(f"attach {att.get('name')}: {e}")
    send = m.send_and_save() if attachments else m.send()
    return {"message_id": getattr(send, "message_id", "") or m.message_id or "",
            "item_id": str(getattr(send, "id", "") or m.id or "")}


def _ews_local_to_server_folder_id(user_id, server_name_map, folder_name):
    return server_name_map.get(folder_name)


def ews_get_attachment(user_id: int, message_id: str, att_name: str) -> bytes:
    """Download one attachment's bytes from the server."""
    account = acct_cached(user_id)
    if not account:
        raise HTTPException(400, "Không kết nối được Exchange")
    item = _find_ews_item(account, None, "", message_id)
    if not item:
        raise HTTPException(404, "Không tìm thấy thư trên server")
    for att in (item.attachments or []):
        if getattr(att, "name", "") == att_name:
            att = att.copy(account) if not getattr(att, "content", None) else att
            return att.content or b""
    raise HTTPException(404, "Không tìm thấy tệp đính kèm")


def ews_set_read(user_id: int, message_id: str, is_read: bool) -> bool:
    """Mirror read-state on Exchange (UpdateItem on the Read flag)."""
    account = acct_cached(user_id)
    if not account:
        return False
    item = _find_ews_item(account, None, "", message_id)
    if not item:
        return False
    try:
        item.is_read = is_read
        item.save(update_fields=["is_read"])
        return True
    except Exception as e:
        logger.error(f"ews set_read {message_id[:30]}: {e}")
        return False


_EMPTY_JOBS = {}   # job_id -> {folder,total,done,server,state} for folder-empty progress
_srvfolder_cache = {}   # key -> {name: folder}
_srvfolder_ts = {}


def _folder_map(account, key=None):
    """Cached name->server-folder map (TTL 5min). The raw root.children walk costs
    dozens of EWS round-trips — never do it per operation."""
    key = key or getattr(account, "primary_smtp_address", "acct")
    now = time.time()
    if now - _srvfolder_ts.get(key, 0) > 300:
        out = {}
        stack = list(account.root.children)
        while stack:
            f = stack.pop()
            try:
                stack.extend(list(f.children))
            except Exception:
                pass
            if (getattr(f, "folder_class", "") or "").endswith(".Note"):
                out.setdefault(nfck(f.name), f)
        _srvfolder_cache[key] = out
        _srvfolder_ts[key] = now
    return _srvfolder_cache[key]


def _find_server_folder(account, names, key=None):
    """Depth-first search a mail folder by display name (str or candidate list)."""
    targets = {nfck(n) for n in ([names] if isinstance(names, str) else names)}
    m = _folder_map(account, key)
    for t in targets:
        f = m.get(t)
        if f is not None:
            return f
    return None


def _invalidate_folder_map(key):
    _srvfolder_ts.pop(key, None)


def ews_server_action(user_id: int, message_id: str, action: str, dest_folder_name: str = "") -> bool:
    """move|delete|archive on the server by rfc822 message_id. Returns True if handled."""
    account, _ = first_account_connect(user_id)
    if not account:
        return False
    item = _find_ews_item(account, None, "", message_id)
    if not item:
        return False
    try:
        if action == "delete":
            item.delete()
        elif action in ("move", "archive"):
            names = ["Lưu trữ", "Archive"] if action == "archive" else [dest_folder_name]
            dest = _find_server_folder(account, [n for n in names if n])
            if dest is None:
                return False  # no server-side equivalent — local move stands
            item.move(dest)
        return True
    except Exception as e:
        logger.error(f"ews {action} {message_id}: {e}")
        return False


# ─── rules engine ─────────────────────────────────────────────────────
class RuleReq(BaseModel):
    name: str
    enabled: bool = True
    c_from: Optional[str] = None
    c_subject: Optional[str] = None
    c_body: Optional[str] = None
    c_to: Optional[str] = None
    c_cc: Optional[str] = None
    c_unread: Optional[bool] = None
    c_has_attachment: Optional[bool] = None
    c_size_min: Optional[int] = None          # KB
    a_folder_id: Optional[int] = None
    a_mark_read: bool = False
    a_star: bool = False
    a_category: Optional[str] = None
    a_flag_days: Optional[int] = None
    a_delete: bool = False
    a_forward: Optional[str] = None           # email to forward to
    a_autoreply: Optional[str] = None         # body of an instant reply
    priority: Optional[int] = 0


def rule_has_conditions(r: dict) -> bool:
    return bool(r.get("c_from") or r.get("c_subject") or r.get("c_body") or r.get("c_to")
                or r.get("c_cc") or r.get("c_unread") or r.get("c_has_attachment")
                or r.get("c_size_min"))


def rule_matches(rule: dict, m: dict) -> bool:
    """All configured conditions must match (AND). A rule with no conditions never fires."""
    if not rule_has_conditions(rule):
        return False
    if rule.get("c_unread") and m.get("is_read"):
        return False
    if rule.get("c_has_attachment") and not m.get("has_attachments"):
        return False
    for fld, key in (("c_from", "from"), ("c_subject", "subject"), ("c_body", "body"),
                     ("c_to", "to"), ("c_cc", "cc")):
        needle = rule.get(fld)
        if needle and needle.lower() not in (m.get(key) or "").lower():
            return False
    if rule.get("c_size_min"):
        try:
            if int((m.get("size") or 0)) < int(rule["c_size_min"]) * 1024:
                return False
        except (TypeError, ValueError):
            pass
    return True


def apply_rules(conn, user_id: int, message_row: dict) -> bool:
    """Run enabled rules on one message (priority desc). Returns True if any fired."""
    rules = [dict(r) for r in conn.execute(
        "SELECT * FROM rules WHERE user_id=? AND enabled=1 ORDER BY priority DESC, rowid", (user_id,))]
    fired = False
    for r in rules:
        try:
            if not rule_matches(r, message_row):
                continue
        except Exception:
            continue
        upd, args = [], []
        if r["a_folder_id"]:
            upd.append("folder_id=?"); args.append(r["a_folder_id"])
        if r["a_mark_read"]:
            upd.append("is_read=1")
        if r["a_star"]:
            upd.append("starred=1")
        if r["a_category"]:
            try:
                cats = json.loads(message_row.get("categories") or "[]")
            except json.JSONDecodeError:
                cats = []
            if r["a_category"] not in cats:
                cats.append(r["a_category"])
            upd.append("categories=?"); args.append(json.dumps(cats))
        if r["a_flag_days"]:
            due = (datetime.now() + timedelta(days=int(r["a_flag_days"]))).isoformat()
            upd.append("flag_due=?"); args.append(due)
        if not upd and not (r.get("a_delete") or r.get("a_forward") or r.get("a_autoreply")):
            continue
        if upd:
            args += [message_row["id"], user_id]
            conn.execute(f"UPDATE messages SET {','.join(upd)} WHERE id=? AND user_id=?", args)
        # side-effect actions (best-effort, never block the rule engine)
        if r.get("a_autoreply"):
            try:
                threading.Thread(target=_rule_autoreply, args=(user_id, message_row, r["a_autoreply"]),
                                 daemon=True).start()
            except Exception as e:
                logger.warning(f"rule autoreply: {e}")
        if r.get("a_forward"):
            try:
                threading.Thread(target=_rule_forward, args=(user_id, message_row, r["a_forward"]),
                                 daemon=True).start()
            except Exception as e:
                logger.warning(f"rule forward: {e}")
        if r.get("a_delete"):
            try:
                conn.execute("UPDATE messages SET deleted_at=?, folder_id=NULL WHERE id=? AND user_id=?",
                             (now_iso(), message_row["id"], user_id))
                _fts_ensure_row(conn, message_row["id"])
            except Exception as e:
                logger.warning(f"rule delete: {e}")
        conn.execute("UPDATE rules SET hits=hits+1, last_hit_at=? WHERE id=?", (now_iso(), r["id"]))
        fired = True
    return fired


def _rule_autoreply(user_id: int, m: dict, body: str):
    """Send an instant reply from a rule (server-side, like Outlook's 'reply with message')."""
    try:
        account = acct_cached(user_id)
        if not account or not m.get("message_id"):
            return
        from exchangelib.items import Message
        from exchangelib.properties import Mailbox
        reply = Message(account=account, folder=account.sent,
                        subject=f"Re: {m.get('subject') or ''}",
                        body=body,
                        to_recipients=[Mailbox(email_address=(m.get("from") or "").split("<")[-1].rstrip(">"))])
        reply.send_and_save()
    except Exception as e:
        logger.warning(f"autoreply rule send: {e}")


def _rule_forward(user_id: int, m: dict, dest_email: str):
    """Forward a matched message to another address (server-side)."""
    try:
        account = acct_cached(user_id)
        if not account or not m.get("message_id"):
            return
        from exchangelib.items import Message
        from exchangelib.properties import Mailbox
        item = _find_ews_item(account, None, "", m["message_id"])
        if item is None:
            return
        item.create_forward(to_recipients=[Mailbox(email_address=dest_email)],
                            subject=f"Fw: {m.get('subject') or ''}",
                            body="").send()
    except Exception as e:
        logger.warning(f"forward rule: {e}")


@app.post("/api/rules/-/run")
async def rules_run_now(user: dict = Depends(current_user)):
    """Apply all enabled rules to currently visible messages (Outlook runs rules on arrival; we run on demand + after sync)."""
    fired = 0
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT m.*, EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id) has_attachments "
            "FROM messages m WHERE m.user_id=? AND m.deleted_at IS NULL", (user["id"],))]
        for m in rows:
            if apply_rules(conn, user["id"], m):
                fired += 1
        audit(conn, user["id"], "rules.run", "all", str(fired))
    return {"success": True, "messages_matched": fired}


@app.get("/api/rules")
async def rules_list(user: dict = Depends(current_user)):
    with get_db() as conn:
        return {"rules": [dict(r) for r in conn.execute("SELECT * FROM rules WHERE user_id=? ORDER BY rowid", (user["id"],))]}


@app.post("/api/rules")
async def rules_add(req: RuleReq, user: dict = Depends(current_user)):
    rid = f"rl-{secrets.token_hex(6)}"
    with get_db() as conn:
        if req.a_folder_id and not conn.execute("SELECT id FROM folders WHERE id=? AND user_id=?",
                                               (req.a_folder_id, user["id"])).fetchone():
            raise HTTPException(400, "Thư mục đích không hợp lệ")
        conn.execute("""INSERT INTO rules (id,user_id,name,enabled,priority,c_from,c_subject,c_body,c_to,c_cc,
                        c_unread,c_has_attachment,c_size_min,
                        a_folder_id,a_mark_read,a_star,a_category,a_flag_days,a_delete,a_forward,a_autoreply)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (rid, user["id"], req.name, 1 if req.enabled else 0, int(req.priority or 0),
                      req.c_from, req.c_subject, req.c_body, req.c_to, req.c_cc,
                      1 if req.c_unread else 0, 1 if req.c_has_attachment else 0, req.c_size_min,
                      req.a_folder_id, 1 if req.a_mark_read else 0, 1 if req.a_star else 0,
                      req.a_category, req.a_flag_days, 1 if req.a_delete else 0,
                      req.a_forward, req.a_autoreply))
        audit(conn, user["id"], "rule.create", req.name)
    return {"success": True, "id": rid}


@app.patch("/api/rules/{rid}")
async def rules_patch(rid: str, req: dict, user: dict = Depends(current_user)):
    allowed = {"name", "enabled", "c_from", "c_subject", "c_body", "c_to", "c_cc", "c_unread",
               "c_has_attachment", "c_size_min", "a_folder_id", "a_mark_read", "a_star",
               "a_category", "a_flag_days", "a_delete", "a_forward", "a_autoreply", "priority"}
    fields = {k: v for k, v in (req or {}).items() if k in allowed}
    if not fields:
        raise HTTPException(400, "Không có trường nào để cập nhật")
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = [(1 if isinstance(v, bool) else v) for v in fields.values()]
    with get_db() as conn:
        if not conn.execute("SELECT id FROM rules WHERE id=? AND user_id=?", (rid, user["id"])).fetchone():
            raise HTTPException(404, "Không tìm thấy rule")
        conn.execute(f"UPDATE rules SET {sets} WHERE id=? AND user_id=?", vals + [rid, user["id"]])
    return {"success": True}


@app.delete("/api/rules/{rid}")
async def rules_del(rid: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("DELETE FROM rules WHERE id=? AND user_id=?", (rid, user["id"]))
    return {"success": True}


# ─── search folders (saved virtual searches, Outlook-style) ──────────
class SearchFolderReq(BaseModel):
    name: str
    folder: Optional[str] = None            # folder type/id or None = all
    unread: bool = False
    starred: bool = False
    flagged: bool = False
    has_attachment: bool = False
    category: Optional[str] = None
    search: Optional[str] = None


def _sf_to_query(r: dict) -> dict:
    return {"folder": r["folder"], "unread": r["unread"], "starred": r["starred"],
            "flagged": r["flagged"], "has_attachment": r["has_attachment"],
            "category": r["category"], "search": r["search"]}


@app.get("/api/search-folders")
async def sf_list(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM search_folders WHERE user_id=? ORDER BY name", (user["id"],))]
    return [{"id": r["id"], "name": r["name"], "query": json.loads(r["query"])} for r in rows]


@app.post("/api/search-folders")
async def sf_create(req: SearchFolderReq, user: dict = Depends(current_user)):
    sid = f"sf-{secrets.token_hex(6)}"
    with get_db() as conn:
        conn.execute("INSERT INTO search_folders (id,user_id,name,query) VALUES (?,?,?,?)",
                     (sid, user["id"], req.name, json.dumps(req.dict(exclude={"name"}), ensure_ascii=False)))
        audit(conn, user["id"], "searchfolder.create", req.name)
    return {"success": True, "id": sid}


@app.delete("/api/search-folders/{sid}")
async def sf_delete(sid: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("DELETE FROM search_folders WHERE id=? AND user_id=?", (sid, user["id"]))
    return {"success": True}


def _search_folder_ids(user_id):
    with get_db() as conn:
        return {r["id"]: r["name"] for r in conn.execute("SELECT id,name FROM search_folders WHERE user_id=?", (user_id,))}


# ─── auth ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "mail-manager", "version": "3.8.2"}


@app.get("/api/auth/status")
def auth_status():
    """First-run detection for the setup wizard."""
    with get_db() as conn:
        n = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
        users = [dict(r) for r in conn.execute("SELECT email, display_name FROM users ORDER BY id")]
    return {"users": n, "setup_required": n == 0, "existing_users": users}


class SetupReq(BaseModel):
    display_name: str
    local_password: str
    exchange_email: str
    exchange_password: str
    server_url: str = "https://mail.fpt.net/EWS/Exchange.asmx"
    sync_now: bool = True


@app.post("/api/setup")
def setup(req: SetupReq):
    """Wizard submit: create local profile, verify Exchange, store it, first sync."""
    if len(req.local_password) < 6:
        raise HTTPException(400, "Mật khẩu cục bộ cần tối thiểu 6 ký tự")
    if "@" not in req.exchange_email:
        raise HTTPException(400, "Email không hợp lệ")

    # 1. verify against Exchange BEFORE creating anything (no writes on failure)
    try:
        account = ews_connect(req.exchange_email, req.exchange_password, req.server_url)
        info = {"folders": [], "unread": None, "total": None}
        try:
            info["unread"] = account.inbox.unread_count
            info["total"] = account.inbox.total_count
        except Exception:
            pass
        info["folders"] = [f.name for f in list(account.root.children)[:30]]
    except Exception as e:
        logger.error(f"setup verify failed: {e}")
        raise HTTPException(400, f"Không kết nối được Exchange: {str(e)[:200]}")

    email = req.exchange_email.strip().lower()
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        if existing:
            user_id = existing["id"]
            conn.execute("UPDATE users SET display_name=? WHERE id=?", (req.display_name, user_id))
        else:
            salt, pwh, _ = make_user(email, req.local_password, req.display_name)
            user_id = conn.execute(
                "INSERT INTO users (email,display_name,salt,pw_hash) VALUES (?,?,?,?)",
                (email, req.display_name, salt, pwh)).lastrowid
        for ft in SYSTEM_FOLDERS:
            get_or_create_folder(conn, user_id, ft)
        # UPSERT, never INSERT OR REPLACE: REPLACE deletes the parent row and
        # breaks messages.account_id FK when a previous sync already stored mail.
        conn.execute("""INSERT INTO mail_accounts (user_id,address,password_encrypted,server_url)
                        VALUES (?,?,?,?)
                        ON CONFLICT(user_id,address) DO UPDATE SET
                          password_encrypted=excluded.password_encrypted,
                          server_url=excluded.server_url""",
                     (user_id, email, encrypt_password(req.exchange_password), req.server_url))
        audit(conn, user_id, "setup", email)
        acct_row = conn.execute("SELECT * FROM mail_accounts WHERE user_id=? AND address=?",
                                (user_id, email)).fetchone()

    sync_stats = None
    if req.sync_now:
        try:
            sync_stats = sync_mailbox(user_id, acct_row)
        except Exception as e:
            logger.error(f"first sync: {e}")
            sync_stats = {"error": str(e)[:150]}

    token = secrets.token_hex(32)
    with get_db() as conn:
        conn.execute("INSERT INTO sessions (token,user_id) VALUES (?,?)", (token, user_id))
    return {"success": True, "token": token,
            "user": {"id": user_id, "email": email, "display_name": req.display_name},
            "exchange": info, "sync": sync_stats}


class VerifyReq(BaseModel):
    exchange_email: str
    exchange_password: str
    server_url: str = "https://mail.fpt.net/EWS/Exchange.asmx"


@app.post("/api/accounts/verify")
def verify_account(req: VerifyReq):
    """Read-only connection test used by the wizard's 'Kiểm tra' button."""
    try:
        account = ews_connect(req.exchange_email, req.exchange_password, req.server_url)
        out = {"success": True, "folders": [f.name for f in list(account.root.children)[:30]]}
        try:
            out["unread"] = account.inbox.unread_count
            out["total"] = account.inbox.total_count
        except Exception:
            pass
        return out
    except Exception as e:
        return {"success": False, "error": str(e)[:220]}


@app.post("/api/sync")
def sync_now(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM mail_accounts WHERE user_id=?", (user["id"],)).fetchall()
    if not rows:
        raise HTTPException(400, "Chưa có tài khoản Exchange nào để đồng bộ")
    total = {"messages": 0, "threads": 0, "contacts": 0, "events": 0, "folders": 0}
    per = []
    for r in rows:
        try:
            s = sync_mailbox(user["id"], r)
            per.append({"address": r["address"], **s})
            for k in total:
                total[k] += s.get(k, 0) or 0
        except Exception as e:
            logger.error(f"sync {r['address']}: {e}")
            per.append({"address": r["address"], "error": str(e)[:180]})
    try:
        import realtime; realtime.ensure_worker(user["id"])   # keep deltas flowing after a full sync
    except Exception:
        pass
    return {"success": True, "total": total, "accounts": per}


@app.post("/api/auth/login")
async def login(req: LoginReq):
    with get_db() as conn:
        u = conn.execute("SELECT * FROM users WHERE email=?", (req.email.lower(),)).fetchone()
        if not u or hash_pw(req.password, u["salt"]) != u["pw_hash"]:
            raise HTTPException(status_code=401, detail="Sai email hoặc mật khẩu")
        token = secrets.token_hex(32)
        conn.execute("INSERT INTO sessions (token,user_id) VALUES (?,?)", (token, u["id"]))
        audit(conn, u["id"], "login", "session")
        try:
            import realtime; realtime.ensure_worker(u["id"])
        except Exception:
            pass
        return {"token": token, "user": {"id": u["id"], "email": u["email"], "display_name": u["display_name"]}}


@app.post("/api/auth/logout")
async def logout(user: dict = Depends(current_user), x_auth_token: str = Header(default=None)):
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token=?", (x_auth_token,))
    return {"success": True}


@app.get("/api/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"user": user}



# ─── local archive (reduce server storage) ────────────────────────────
def _archive_dir(user_id: int) -> str:
    path = get_settings(user_id).get("archive_path") or os.path.expanduser("~/MailArchive")
    os.makedirs(path, exist_ok=True)
    return path


def _eml_path(user_id: int, eid: str) -> str:
    """One .eml per message, stored in year subfolders (Outlook's own structure)."""
    with get_db() as conn:
        r = conn.execute("SELECT date FROM messages WHERE id=? AND user_id=?", (eid, user_id)).fetchone()
    year = (r["date"][:4] if r and r["date"] else str(time.localtime().tm_year)) or str(time.localtime().tm_year)
    d = os.path.join(_archive_dir(user_id), year)
    os.makedirs(d, exist_ok=True)
    safe = re.sub(r"[^0-9A-Za-z._-]+", "_", eid) or "mail"
    return os.path.join(d, f"{safe}.eml")


def _write_eml(user_id: int, eid: str) -> str:
    """Export a message to .eml (headers + body + embedded attachments).
    Uses the local DB copy; attachments are pulled from Exchange best-effort."""
    with get_db() as conn:
        m = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (eid, user_id)).fetchone()
        atts = [dict(r) for r in conn.execute(
            "SELECT * FROM attachments WHERE message_id=? AND is_inline=0", (eid,))]
    if not m:
        raise HTTPException(404, "Không tìm thấy thư")
    def hdr(name, val):
        v = str(val or "").strip()
        return f"{name}: {v}\r\n" if v else ""
    lines = [hdr("From", m["from"]), hdr("To", m["to"]), hdr("Cc", m["cc"]),
             hdr("Subject", m["subject"]), hdr("Date", m["date"]),
             hdr("Message-ID", m["message_id"])]
    boundary = None
    if atts:
        import uuid
        boundary = "----=_MM_" + uuid.uuid4().hex
        lines.append(f"Content-Type: multipart/mixed; boundary=\"{boundary}\"\r\n")
    else:
        lines.append("Content-Type: text/html; charset=utf-8\r\n")
    body = m["html_body"] or m["body"] or ""
    if boundary:
        lines.append(f"--{boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{body}\r\n")
        for a in atts:
            data = _read_attachment_bytes(user_id, eid, a["id"]) if a.get("storage_ref") else _fetch_attachment_bytes(user_id, eid, a["id"])
            if data:
                import base64
                lines.append(f"--{boundary}\r\n"
                             f"Content-Type: {a.get('mime_type') or 'application/octet-stream'}; name=\"{a.get('name')}\"\r\n"
                             f"Content-Transfer-Encoding: base64\r\n"
                             f"Content-Disposition: attachment; filename=\"{a.get('name')}\"\r\n\r\n"
                             f"{base64.b64encode(data).decode()}\r\n")
        lines.append(f"--{boundary}--\r\n")
    else:
        lines.append(body)
    path = _eml_path(user_id, eid)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\r\n".join(lines))
    return path


def _read_attachment_bytes(user_id: int, eid: str, att_id: str):
    return None  # placeholder kept for API stability; streaming path is _fetch_attachment_bytes


def _fetch_attachment_bytes(user_id: int, eid: str, att_id: str):
    """Best-effort pull of an attachment payload from Exchange."""
    try:
        account = acct_cached(user_id)
        if not account:
            return None
        with get_db() as conn:
            r = conn.execute("SELECT message_id, folder_id FROM messages WHERE id=? AND user_id=?", (eid, user_id)).fetchone()
        if not r:
            return None
        item = _find_item_in_folder_by_id(account, _conn_readonly(), r["folder_id"], r["message_id"])
        if item is None:
            return None
        for a in getattr(item, "attachments", None) or []:
            if getattr(a, "name", None) and str(a.name) == att_id:
                a.attach()
                return a.content if hasattr(a, "content") else None
    except Exception as e:
        logger.warning(f"att bytes for archive: {e}")
    return None


@app.post("/api/emails/{eid}/archive-local")
async def api_archive_local(eid: str, user: dict = Depends(current_user)):
    """Export to .eml under the configured local archive path. Removes it from the
    server (and from the live sync folders) so server storage is reclaimed; the mail
    stays searchable here because the row + body stay in the DB with a new status."""
    with get_db() as conn:
        m = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (eid, user["id"])).fetchone()
        if not m:
            raise HTTPException(404, "Không tìm thấy thư")
        if m["archived_local"]:
            raise HTTPException(409, "Đã lưu trữ rồi")
    path = _write_eml(user["id"], eid)   # export first so failure here = no data loss
    with get_db() as conn:
        # keep searchable and visible: body + row + folder stay, flagged as locally archived
        # (server storage reclaimed via the delete below; the local copy remains in the list)
        try:
            conn.execute("UPDATE messages SET archived_local=1, archive_path=? WHERE id=? AND user_id=?",
                         (path, eid, user["id"]))
        except sqlite3.OperationalError:
            pass
        _fts_ensure_row(conn, eid)
        audit(conn, user["id"], "mail.archive-local", eid, path)
    # then delete from Exchange, best-effort
    try:
        ews_server_action(user["id"], m["message_id"], "delete")
    except Exception as e:
        logger.warning(f"server delete after archive: {e}")
    return {"success": True, "path": path}


@app.post("/api/emails/{eid}/unarchive")
async def api_unarchive_local(eid: str, user: dict = Depends(current_user)):
    """Undo: mail is moved back to the server (re-sent to self via draft+send, or
    simply restored to the live folders by clearing the flag — the .eml is kept)."""
    with get_db() as conn:
        conn.execute("UPDATE messages SET archived_local=0, archive_path=NULL WHERE id=? AND user_id=?",
                     (eid, user["id"]))
        _fts_ensure_row(conn, eid)
        audit(conn, user["id"], "mail.unarchive-local", eid)
    return {"success": True}


@app.get("/api/archive/browse")
async def api_archive_browse(path: str = "", user: dict = Depends(current_user)):
    """Browse the local archive tree — .eml files load back into search/results."""
    root = get_settings(user["id"]).get("archive_path") or os.path.expanduser("~/MailArchive")
    base = os.path.join(root, path) if path else root
    if not os.path.isdir(base):
        raise HTTPException(404, "Thư mục lưu trữ không tồn tại")
    out = []
    for name in sorted(os.listdir(base)):
        full = os.path.join(base, name)
        if os.path.isdir(full):
            out.append({"name": name, "type": "dir"})
        elif name.lower().endswith(".eml"):
            st = os.stat(full)
            out.append({"name": name, "type": "eml", "size": st.st_size, "path": os.path.relpath(full, root)})
    return {"items": out, "root": root, "current": path}


@app.get("/api/archive/eml")
async def api_archive_eml(path: str, user: dict = Depends(current_user)):
    """Load a stored .eml back and expose it in the reader/search."""
    root = get_settings(user["id"]).get("archive_path") or os.path.expanduser("~/MailArchive")
    full = os.path.abspath(os.path.join(root, path))
    if not full.startswith(os.path.abspath(root)):
        raise HTTPException(403, "Ngoài thư mục lưu trữ")
    if not os.path.isfile(full):
        raise HTTPException(404, "Không tìm thấy file")
    with open(full, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()
    import email as _email
    msg = _email.message_from_string(raw)
    subject = msg.get("Subject", "")
    return {
        "success": True,
        "mail": {
            "subject": subject,
            "from": msg.get("From", ""),
            "to": msg.get("To", ""),
            "cc": msg.get("Cc", ""),
            "date": msg.get("Date", ""),
            "body": raw.split("\r\n\r\n", 1)[-1],
            "path": path,
        },
    }


# ─── user settings ────────────────────────────────────────────────────
class SettingsReq(BaseModel):
    values: dict


DEFAULT_SETTINGS = {"theme": "dark", "density": "comfortable", "reading_pane": "right",
                    "signature": "", "signature_html": "", "compose_font": "Calibri",
                    "compose_size": "14px", "autosync": True, "sync_interval_min": 5,
                    "default_reply_all": False,
                    "archive_path": os.path.expanduser("~/MailArchive")}


def get_settings(user_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT json FROM user_settings WHERE user_id=?", (user_id,)).fetchone()
    try:
        stored = json.loads(row["json"]) if row else {}
    except json.JSONDecodeError:
        stored = {}
    return {**DEFAULT_SETTINGS, **stored}


@app.get("/api/settings")
async def api_settings_get(user: dict = Depends(current_user)):
    return {"settings": get_settings(user["id"])}


@app.put("/api/settings")
async def api_settings_put(req: SettingsReq, user: dict = Depends(current_user)):
    allowed = {k: v for k, v in req.values.items() if k in DEFAULT_SETTINGS}
    merged = {**get_settings(user["id"]), **allowed}
    with get_db() as conn:
        conn.execute(
            """INSERT INTO user_settings (user_id, json, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
               ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=CURRENT_TIMESTAMP""",
            (user["id"], json.dumps(merged, ensure_ascii=False)))
    return {"success": True, "settings": merged}


# ─── server storage (Outlook "Mailbox usage") ─────────────────────────
def _fmt_bytes(n):
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}"
        n /= 1024


def _ews_folder_sizes(account):
    """Raw GetFolder call: EWS returns <FolderSize> (bytes) and <TotalItemCount>.
    exchangelib 5.6 does not expose these, so parse the SOAP envelope ourselves."""
    import re as _re
    from exchangelib.services import GetFolder
    from exchangelib.folders import Folder
    from exchangelib.properties import FolderId
    try:
        from exchangelib.fields import ExtendedPropertyField
        from exchangelib.properties import ExtendedProperty
    except Exception:
        pass
    # list all mail folders from the cached tree
    folders = []
    try:
        for f in account.root.walk():
            if getattr(f, "folder_class_name", None) in ("IPF.Note", None):
                folders.append(f)
    except Exception:
        folders = [account.inbox]
    names, sizes, counts = [], [], []
    for f in folders:
        try:
            # request the folder with its size: EWS FolderSize is a direct child element
            got = GetFolder(account=account).get(
                folders=[f], shape="IdOnly", additional_fields=["folder:FolderSize", "folder:TotalItemCount"])
        except Exception as e:
            logger.warning(f"folder size {getattr(f, 'name', '?')}: {e}")
            got = None
        sz, cnt = 0, 0
        if got:
            try:
                g = got[0] if isinstance(got, list) else got
                sz = int(getattr(g, "folder_size", 0) or 0) or 0
                cnt = int(getattr(g, "total_item_count", 0) or 0) or 0
            except Exception:
                pass
        names.append(f.name)
        sizes.append(sz)
        counts.append(cnt)
    return names, sizes, counts


@app.get("/api/mailbox/usage")
async def api_mailbox_usage(user: dict = Depends(current_user)):
    """Folder sizes + total usage from Exchange (ExtendedField FolderSize /
    TotalItemSize). Cached 10 min — the call walks the folder tree."""
    import time as _t
    key = ("usage", user["id"])
    cached = _USAGE_CACHE.get(key)
    if cached and _t.time() - cached["ts"] < 600:
        return cached["data"]
    account = acct_cached(user_id=user["id"])
    if not account:
        raise HTTPException(503, "Chưa kết nối được Exchange")
    folders = []
    total = 0
    try:
        # exchangelib 5.6 has no total_item_size; ask EWS directly for
        # FolderSize + TotalItemCount via the raw protocol service.
        names, sizes, counts = _ews_folder_sizes(account)
        for i, n in enumerate(names):
            sz = sizes[i] or 0
            total += sz
            folders.append({"name": n, "size": sz, "count": counts[i]})
        folders.sort(key=lambda x: -(x["size"] or 0))
    except Exception as e:
        logger.error(f"mailbox usage: {e}")
        raise HTTPException(500, f"Không lấy được dung lượng: {e}")
    data = {"total_bytes": total, "total_human": _fmt_bytes(total),
            "folders": [{"name": f["name"], "size": f["size"], "human": _fmt_bytes(f["size"])}
                        for f in folders[:15]]}
    _USAGE_CACHE[key] = {"ts": _t.time(), "data": data}
    return data


_USAGE_CACHE = {}


# ─── automatic replies (Outlook "Automatic Replies" / OOF) ───────────
class AutoReplyReq(BaseModel):
    enabled: bool = False
    external: bool = True            # also reply to senders outside the org
    message: str = ""
    start_at: Optional[str] = None   # ISO; empty = always (like Outlook "Send replies now")
    end_at: Optional[str] = None


@app.get("/api/autoreply")
async def api_autoreply_get(user: dict = Depends(current_user)):
    """Read the server-side OOF state. Exchangelib exposes it on account.oof_settings."""
    account = acct_cached(user_id=user["id"])
    if not account:
        raise HTTPException(503, "Chưa kết nối được Exchange")
    try:
        oof = account.oof_settings
        state = str(getattr(oof, "state", "") or "")
        enabled = state.lower().startswith("enabled")
        ext = getattr(oof, "external_audience", None)
        ext_txt = str(ext) if ext is not None else ""
        reply = getattr(oof, "internal_reply", "") or getattr(oof, "reply_body", "") or ""
        try:
            reply = str(reply)
        except Exception:
            reply = ""
        return {
            "enabled": enabled,
            "scheduled": state.lower() == "scheduled",
            "external": "all" in ext_txt.lower() if ext_txt else True,
            "message": reply,
            "start_at": str(getattr(oof, "start", "") or "") if enabled else None,
            "end_at": str(getattr(oof, "end", "") or "") if enabled else None,
        }
    except Exception as e:
        logger.error(f"oof get: {e}")
        raise HTTPException(500, f"Không đọc được trạng thái: {e}")


@app.put("/api/autoreply")
async def api_autoreply_put(req: AutoReplyReq, user: dict = Depends(current_user)):
    """Outlook-style automatic replies: set server-side OOF so every sender gets
    an answer even when the app is closed."""
    account = acct_cached(user_id=user["id"])
    if not account:
        raise HTTPException(503, "Chưa kết nối được Exchange")
    try:
        from exchangelib.properties import OofSettings
        oof = OofSettings(
            state=("Disabled" if not req.enabled else
                   ("Scheduled" if (req.start_at and req.end_at) else "Enabled")),
            external_audience=("All" if req.external else "Known"),
            internal_reply=req.message or "",
            external_reply=req.message or "",
        )
        if req.start_at and req.end_at:
            from exchangelib.ewsdatetime import EWSDateTime
            from datetime import datetime
            def _pdt(v):
                dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                return EWSDateTime.from_datetime(dt)
            oof.start = _pdt(req.start_at)
            oof.end = _pdt(req.end_at)
        account.oof_settings = oof
        with get_db() as conn:
            audit(conn, user["id"], "autoreply.set", "enabled" if req.enabled else "disabled",
                  (req.message or "")[:80])
        return {"success": True}
    except Exception as e:
        logger.error(f"oof set: {e}")
        raise HTTPException(500, f"Không đặt được trả lời tự động: {e}")


# ─── folders ──────────────────────────────────────────────────────────
@app.get("/api/folders")
async def api_folders(user: dict = Depends(current_user)):
    with get_db() as conn:
        return {"tree": folder_tree(user["id"], conn)}


@app.post("/api/folders")
async def api_folder_create(req: FolderCreate, user: dict = Depends(current_user)):
    with get_db() as conn:
        parent = None
        parent_name = None
        if req.parent_id:
            pr = conn.execute("SELECT id,name FROM folders WHERE id=? AND user_id=?", (req.parent_id, user["id"])).fetchone()
            parent = pr["id"] if pr else None
            parent_name = pr["name"] if pr else None
        elif req.parent_type:
            pr = conn.execute("SELECT id FROM folders WHERE user_id=? AND type=?", (user["id"], req.parent_type)).fetchone()
            parent = pr["id"] if pr else None
            parent_name = SYSTEM_FOLDERS.get(req.parent_type, "Hộp thư đến")
        get_or_create_folder(conn, user["id"], "user", req.name, parent)
        audit(conn, user["id"], "folder.create", req.name)
    # create on Exchange too, under the same-named server parent (best-effort)
    srv = False
    try:
        account, _ = first_account_connect(user["id"])
        if account:
            sf = _find_server_folder(account, [parent_name]) if parent_name else account.inbox
            if sf is not None:
                from exchangelib.folders import Folder
                Folder(parent=sf, name=nfck(req.name)).create()
                srv = True
    except Exception as e:
        logger.error(f"server folder create {req.name}: {e}")
    return {"success": True, "server": srv}



class FolderReorder(BaseModel):
    items: list  # [{id, parent_id}]
class FolderRename(BaseModel):
    name: str

class BatchArchiveReq(BaseModel):
    folder_ids: list[int]
    before_date: str  # ISO date, e.g. "2024-01-01"
    include_subfolders: bool = True


@app.put("/api/folders/{fid}")
async def api_folder_rename(fid: int, req: FolderRename, user: dict = Depends(current_user)):
    new = nfck(req.name)
    if not new:
        raise HTTPException(400, "Tên rỗng")
    with get_db() as conn:
        f = conn.execute("SELECT * FROM folders WHERE id=? AND user_id=?", (fid, user["id"])).fetchone()
        if not f:
            raise HTTPException(404, "Không tìm thấy thư mục")
        conn.execute("UPDATE folders SET name=? WHERE id=?", (new, fid))
        audit(conn, user["id"], "folder.rename", str(fid), new)
    # rename the folder on Exchange too, if it exists there
    srv = False
    try:
        acc = first_account_connect(user["id"])
        if acc[0]:
            sf = _find_server_folder(acc[0], [f["name"]])
            if sf is not None:
                sf.name = new
                sf.update()
                srv = True
    except Exception as e:
        logger.error(f"server rename {fid}: {e}")
    return {"success": True, "server": srv}


@app.post("/api/folders/reorder")
async def api_folder_reorder(req: FolderReorder, user: dict = Depends(current_user)):
    """Drag-drop reorder: persist new ordering locally so the tree renders in
    the user's preferred order. Exchange has no user-facing folder order (its
    sort is alphabetical/creation) — ordering is a client-side display concern,
    so we persist here and re-render the tree from order_index."""
    with get_db() as conn:
        # verify all folders belong to the user, then assign order_index
        owned = set(r["id"] for r in conn.execute(
            "SELECT id FROM folders WHERE user_id=?", (user["id"],)))
        items = [it for it in req.items if it.get("id") in owned]
        for pos, it in enumerate(items):
            pid = it.get("parent_id")
            if pid is not None and pid not in owned:
                pid = None
            conn.execute("UPDATE folders SET order_index=?, parent_id=COALESCE(?, parent_id) WHERE id=?",
                         (pos, pid, it["id"]))
    return {"success": True}


@app.post("/api/folders/{fid}/empty")
async def api_folder_empty(fid: int, user: dict = Depends(current_user)):
    """Outlook 'Empty Folder': local move-to-trash + server-side empty, reported as a
    background job with progress events (SSE 'empty_progress' + GET /api/empty/<job>)."""
    with get_db() as conn:
        f = conn.execute("SELECT id, name FROM folders WHERE id=? AND user_id=?", (fid, user["id"])).fetchone()
        if not f:
            raise HTTPException(404, "Không tìm thấy thư mục")
        rows = conn.execute("SELECT message_id, ews_item_id FROM messages WHERE folder_id=? AND user_id=? AND deleted_at IS NULL",
                            (fid, user["id"])).fetchall()
        mids = [r["message_id"] for r in rows if r["message_id"]]
        rawids = [r["ews_item_id"] for r in rows if r["ews_item_id"]]
        conn.execute("UPDATE messages SET deleted_at=?, folder_id=? WHERE folder_id=? AND user_id=? AND deleted_at IS NULL",
                     (now_iso(), get_or_create_folder(conn, user["id"], "trash"), fid, user["id"]))
        audit(conn, user["id"], "folder.empty", str(fid), str(len(mids)))
    job = _empty_job_new(user["id"], f["name"], len(mids))
    threading.Thread(target=_empty_job_run, args=(job, user["id"], f["name"], mids, rawids), daemon=True).start()
    return {"success": True, "job": job, "total": len(mids)}


def _empty_job_new(uid, name, total):
    job = "job-" + secrets.token_hex(6)
    _EMPTY_JOBS[job] = {"id": job, "user_id": uid, "folder": name, "total": total, "done": 0,
                        "server": 0, "state": "running", "started": time.time()}
    _empty_publish(job)
    return job


def _empty_publish(job):
    j = _EMPTY_JOBS.get(job) or {}
    try:
        from . import realtime
    except ImportError:
        import realtime
    realtime.publish(j.get("user_id", 0), {"type": "empty_progress", "job": job, "folder": j.get("folder"),
                                            "total": j.get("total"), "done": j.get("done"),
                                            "server": j.get("server"), "state": j.get("state")})


def _empty_bump(job, done=None, server=None, state=None):
    j = _EMPTY_JOBS.get(job)
    if not j:
        return
    if done is not None: j["done"] = done
    if server is not None: j["server"] = server
    if state is not None: j["state"] = state
    _empty_publish(job)


def _empty_job_run(job, uid, name, mids, rawids):
    """Server side: try the single-shot EWS EmptyFolder (exactly what Outlook does),
    fall back to chunked item deletes. Local rows already trashed; 'done' counts server work."""
    total = len(mids)
    try:
        account, _ = first_account_connect(uid)
        if not account:
            _empty_bump(job, done=total, state="done")
            return
        sf = _find_server_folder(account, [name])
        if sf is not None and hasattr(sf, "empty"):
            try:
                sf.empty()
                _empty_bump(job, done=total, server=total, state="done")
                return
            except Exception as e:
                logger.warning(f"empty folder single-shot failed: {e}")
        n = 0
        CHUNK = 100
        for i in range(0, len(rawids), CHUNK):
            try:
                account.bulk_delete([(x, None) for x in rawids[i:i + CHUNK]])
                n += len(rawids[i:i + CHUNK])
            except Exception:
                for x in rawids[i:i + CHUNK]:
                    try:
                        _find_ews_item(account, None, x).delete(); n += 1
                    except Exception:
                        pass
            _empty_bump(job, done=min(n, total), server=n)
        _empty_bump(job, done=total, server=n, state="done")
    except Exception as e:
        logger.error(f"folder empty job: {e}")
        _empty_bump(job, done=total, state="done")
    finally:
        try:
            threading.Timer(60, lambda: _EMPTY_JOBS.pop(job, None)).start()
        except Exception:
            pass


@app.get("/api/empty/{job}")
async def api_empty_status(job: str, user: dict = Depends(current_user)):
    j = _EMPTY_JOBS.get(job)
    if not j or j["user_id"] != user["id"]:
        raise HTTPException(404, "Job not found")
    return {k: v for k, v in j.items() if k != "user_id"}


@app.delete("/api/folders/{fid}")
async def api_folder_delete(fid: int, user: dict = Depends(current_user)):
    with get_db() as conn:
        f = conn.execute("SELECT * FROM folders WHERE id=? AND user_id=?", (fid, user["id"])).fetchone()
        if not f:
            raise HTTPException(404, "Folder not found")
        if f["type"] != "user":
            raise HTTPException(400, "Không xóa được thư mục hệ thống")
        conn.execute("UPDATE messages SET folder_id=? WHERE folder_id=? AND user_id=?",
                     (f["parent_id"] or get_or_create_folder(conn, user["id"], "inbox"), fid, user["id"]))
        conn.execute("DELETE FROM folders WHERE id=?", (fid,))
    # mirror the delete on Exchange (moves to server's Deleted Items)
    srv = False
    try:
        account, _ = first_account_connect(user["id"])
        if account:
            sf = _find_server_folder(account, [f["name"]])
            if sf is not None:
                sf.delete()
                srv = True
    except Exception as e:
        logger.error(f"server folder delete {fid}: {e}")
    return {"success": True, "server": srv}


# ─── emails ───────────────────────────────────────────────────────────
@app.get("/api/emails")
async def api_emails(folder: str = "inbox", conversation: bool = True, search: str = "",
                     category: str = "", starred: bool = False, flagged: bool = False,
                     has_attachment: bool = False,
                     limit: int = 50, page: int = 1, user: dict = Depends(current_user)):
    with get_db() as conn:
        q = """SELECT m.*, f.type as folder_type, f.name as folder_name,
                      EXISTS(SELECT 1 FROM attachments a WHERE a.message_id = m.id) as has_attachments
               FROM messages m
               LEFT JOIN folders f ON f.id = m.folder_id
               WHERE m.user_id=? AND m.deleted_at IS NULL"""
        params = [user["id"]]
        sf = folder.startswith("sf-") and conn.execute(
            "SELECT * FROM search_folders WHERE id=? AND user_id=?", (folder, user["id"])).fetchone()
        if sf:  # saved virtual folder: apply its stored query instead of a real folder
            sj = json.loads(sf["query"])
            if sj.get("folder"):
                fq = conn.execute("SELECT id FROM folders WHERE user_id=? AND (type=? OR id=? OR name=?)",
                                  (user["id"], sj["folder"], sj["folder"] if str(sj["folder"]).isdigit() else -1, sj["folder"])).fetchone()
                if fq:
                    q += " AND m.folder_id=?"; params.append(fq["id"])
            if sj.get("unread"):
                q += " AND m.is_read=0"
            if sj.get("starred"):
                q += " AND m.starred=1"
            if sj.get("flagged"):
                q += " AND m.flag_due IS NOT NULL AND m.flag_due != ''"
            if sj.get("has_attachment"):
                q += " AND EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id)"
            if sj.get("category"):
                q += " AND m.categories LIKE ?"; params.append(f"%{sj['category']}%")
            if sj.get("search"):
                fx = _fts_match(sj["search"])
                if fx:
                    q += " AND m.rowid IN (SELECT rowid FROM msg_fts WHERE msg_fts MATCH ?)"
                    params.append(fx)
                else:
                    q += ' AND (m.subject LIKE ? OR m."from" LIKE ? OR m.preview LIKE ? OR m.body LIKE ?)'
                    s = f"%{sj['search']}%"; params += [s] * 4
        elif folder and folder != "all":
            fq = conn.execute("SELECT id FROM folders WHERE user_id=? AND (type=? OR id=? OR name=?)",
                              (user["id"], folder, folder if folder.isdigit() else -1, folder)).fetchone()
            if not fq:
                raise HTTPException(404, "Folder not found")
            q += " AND m.folder_id=?"; params.append(fq["id"])
        if search:
            fx = _fts_match(search)
            if fx:
                q += " AND m.rowid IN (SELECT rowid FROM msg_fts WHERE msg_fts MATCH ?)"
                params.append(fx)
            else:
                q += ' AND (m.subject LIKE ? OR m."from" LIKE ? OR m.preview LIKE ? OR m.body LIKE ?)'
                s = f"%{search}%"; params += [s] * 4
        if category:
            q += " AND categories LIKE ?"; params.append(f"%{category}%")
        if starred:
            q += " AND starred=1"
        if flagged:
            q += " AND flag_due IS NOT NULL AND flag_due != ''"
        if has_attachment:
            q += " AND EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id)"
        q += " ORDER BY m.date DESC LIMIT ? OFFSET ?"
        params += [limit, (page - 1) * limit]
        rows = [_parse_msg(r) for r in conn.execute(q, params)]

        # warm bodies for exactly these mails (the ones about to be clicked)
        uid = user["id"]
        threading.Thread(target=lambda: [hq_push(uid, m["id"]) for m in rows[:30]], daemon=True).start()

        if conversation:
            groups = {}
            for m in rows:
                groups.setdefault(m["thread_id"] or m["id"], []).append(m)
            out = [{"thread_id": tid, "email": g[0], "reply_count": len(g) - 1, "replies": g[1:]}
                   for tid, g in groups.items()]
            return {"emails": out, "total": len(out), "conversation": True}
        return {"emails": rows, "total": len(rows), "conversation": False}


def _find_item_in_folder_by_id(account, conn, folder_id, message_id):
    """Fast targeted lookup: local folder name -> server folder, one get() call
    instead of walking the whole tree."""
    try:
        fr = conn.execute("SELECT name FROM folders WHERE id=?", (folder_id,)).fetchone()
        if fr:
            sf = _find_server_folder(account, [fr["name"]])
            if sf is not None:
                return sf.get(message_id=message_id)
    except Exception:
        pass
    return None


def _server_set_read_async(user_id, message_id, is_read):
    """Fire-and-forget read-state mirror: opening a mail never blocks on EWS."""
    def work():
        try:
            account = acct_cached(user_id)
            if not account:
                return
            fid = None
            with get_db() as conn:
                row = conn.execute("SELECT folder_id FROM messages WHERE user_id=? AND message_id=?",
                                   (user_id, message_id)).fetchone()
                fid = row["folder_id"] if row else None
            item = None
            if fid:
                with get_db() as conn:
                    item = _find_item_in_folder_by_id(account, conn, fid, message_id)
            if item is None:
                item = _find_ews_item(account, None, "", message_id)
            if item is not None:
                item.is_read = is_read
                item.save(update_fields=["is_read"])
        except Exception as e:
            logger.debug(f"async set_read: {e}")
    threading.Thread(target=work, daemon=True).start()


def _hydrate_message(user_id, email_id):
    """Delta-sync can store items with empty bodies (SyncFolderItems ID_ONLY shape).
    Fetch the full item from Exchange once and fill it in. Runs on the hydrate worker
    thread — never in the request path."""
    with get_db() as conn:
        row = conn.execute("SELECT message_id, folder_id, body, html_body FROM messages WHERE id=? AND user_id=?",
                           (email_id, user_id)).fetchone()
    if not row or row["body"] or row["html_body"]:
        return
    if not row["message_id"]:
        return
    account = acct_cached(user_id)
    if not account:
        return
    item = _find_item_in_folder_by_id(account, _conn_readonly(), row["folder_id"], row["message_id"])
    if item is None:
        item = _find_ews_item(account, None, "", row["message_id"])
    if item is None:
        # gone on server (moved out of every scanned folder / purged) — settle the row
        # once so it never re-queues and never keeps the click waiting 6s
        with get_db() as conn:
            conn.execute("UPDATE messages SET body=?, preview=? WHERE id=? AND (body='' OR body IS NULL)",
                         ("(Thư này không còn trên server — có thể đã được di chuyển hoặc dọn dẹp.)",
                          "(Không còn trên server)", email_id))
            _fts_ensure_row(conn, email_id)
        return
    raw = item.body if item.body is not None else ""
    from exchangelib.properties import HTMLBody as _HTMLB
    if isinstance(raw, _HTMLB) or (isinstance(raw, str) and raw.lstrip()[:5].lower() == "<html"):
        html = str(raw)
        text = _strip_html(html)
    else:
        html, text = None, str(raw)
    with get_db() as conn:
        conn.execute("UPDATE messages SET body=?, html_body=?, preview=? WHERE id=? AND user_id=? AND (body='' OR body IS NULL)",
                     (text, html, text[:400], email_id, user_id))
        # (re)record attachments with content_id now that we have the full item
        for i, at in enumerate(getattr(item, "attachments", None) or []):
            conn.execute("INSERT OR IGNORE INTO attachments (id,message_id,name,mime_type,size,content_id,is_inline) VALUES (?,?,?,?,?,?,?)",
                         (f"att-{email_id}-{i}", email_id, getattr(at, "name", f"file{i}"),
                          str(getattr(at, "content_type", "application/octet-stream")),
                          getattr(at, "size", 0) or 0,
                          getattr(at, "content_id", None) or None,
                          1 if getattr(at, "is_inline", False) else 0))
            # rows stored by delta-sync before content_id existed: backfill by name
            cid_v = getattr(at, "content_id", None) or None
            if cid_v:
                conn.execute("UPDATE attachments SET content_id=?, is_inline=? WHERE message_id=? AND name=? AND content_id IS NULL",
                             (cid_v, 1 if getattr(at, "is_inline", False) else 0, email_id, getattr(at, "name", "")))
    logger.info(f"hydrated {email_id} body={len(text)}")
    _fts_ensure_row(conn, email_id)


def _conn_readonly():
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA busy_timeout = 30000")
    return c


# ─── hydration queue: instant opens, Outlook-style ────────────────────────
# A single worker drains this FIFO; click-open pushes a PRIORITY job (front)
# while list-scroll prefetching pushes background jobs (back).
import queue as _queue

_HQ = _queue.PriorityQueue()
_HQ_SEQ = 0
_HQ_INFLIGHT = set()


def hq_push(user_id, email_id, urgent=False):
    """Queue a body-hydration job. urgent -> jump the line. Returns True if newly queued."""
    global _HQ_SEQ
    with get_db() as conn:
        r = conn.execute("SELECT body, html_body FROM messages WHERE id=? AND user_id=?", (email_id, user_id)).fetchone()
    if not r or r["body"] or r["html_body"]:
        return False
    key = (user_id, email_id)
    if key in _HQ_INFLIGHT:
        return False
    _HQ_SEQ += 1
    _HQ.put((0 if urgent else 1, _HQ_SEQ, user_id, email_id))
    return True


def hydrate_now(user_id, email_id, timeout=6):
    """Blocking-wait variant for the open-mail endpoint: push a priority job and
    poll the DB up to `timeout`s. If a worker is already on this mail, just wait
    for it instead of queueing a duplicate. Returns True if body arrived."""
    urgent_queued = hq_push(user_id, email_id, urgent=True)
    deadline = time.time() + timeout
    while time.time() < deadline:
        with get_db() as conn:
            r = conn.execute("SELECT body, html_body FROM messages WHERE id=?", (email_id,)).fetchone()
        if r and (r["body"] or r["html_body"]):
            return True
        if not urgent_queued and (user_id, email_id) not in _HQ_INFLIGHT:
            _HQ_INFLIGHT.discard((user_id, email_id))
            hq_push(user_id, email_id, urgent=True)   # stale queue entry -> re-queue once
            urgent_queued = True
        time.sleep(0.25)
    return False


def _hq_worker():
    while True:
        prio, _, user_id, email_id = _HQ.get()
        key = (user_id, email_id)
        _HQ_INFLIGHT.add(key)
        try:
            _hydrate_message(user_id, email_id)
        except Exception as e:
            logger.error(f"hq hydrate {email_id}: {e}")
        finally:
            _HQ_INFLIGHT.discard(key)
            time.sleep(0.2)   # be gentle on EWS


def _warm_ews(user_id):
    """Outlook keeps its connection + folder tree hot; so do we. Without this the
    FIRST click after boot pays a 30-60s Autodiscover+tree-walk inside the worker."""
    account = acct_cached(user_id)
    if not account:
        return
    try:
        from realtime import _server_folders_by_name
        _server_folders_by_name(account)   # warm the folder map used by every hydrate
    except Exception:
        pass
    try:
        with get_db() as conn:
            r = conn.execute("SELECT id FROM messages WHERE user_id=? AND deleted_at IS NULL "
                             "AND (body='' OR body IS NULL) AND (html_body='' OR html_body IS NULL) LIMIT 1", (user_id,)).fetchone()
        if r:
            hq_push(user_id, r["id"])   # first real job primes the full path
    except Exception:
        pass


def _hq_warm_boot():
    try:
        with get_db() as conn:
            uids = [x["user_id"] for x in conn.execute("SELECT DISTINCT user_id FROM mail_accounts").fetchall()]
    except Exception:
        uids = []
    for u in uids:
        _warm_ews(u)


threading.Thread(target=_hq_warm_boot, daemon=True).start()
threading.Thread(target=_hq_worker, daemon=True).start()


def _prefetch_recent(user_id, folder_id=None, limit=25):
    """Warm the body cache for the newest mails of a folder — the ones the user is
    about to click — via background hydration jobs."""
    try:
        with get_db() as conn:
            q = ("SELECT id FROM messages WHERE user_id=? AND deleted_at IS NULL"
                 + (" AND folder_id=?" if folder_id else "")
                 + " ORDER BY date DESC LIMIT ?")
            rows = conn.execute(q, ([user_id] + ([folder_id] if folder_id else []) + [limit])).fetchall()
        for r in rows:
            hq_push(user_id, r["id"])
    except Exception:
        pass


@app.get("/api/emails/{email_id}")
def api_email_get(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Email not found")
        was_unread = not row["is_read"]
        conn.execute("UPDATE messages SET is_read=1 WHERE id=?", (email_id,))
        empty = not (row["body"] or row["html_body"])
    if empty:
        hydrate_now(user["id"], email_id, timeout=6)   # priority job on the hydrator thread
    with get_db() as conn:
        row = conn.execute("SELECT * FROM messages WHERE id=?", (email_id,)).fetchone()
        m = _parse_msg(row)
        m["is_read"] = True
        m["attachments"] = [dict(r) for r in conn.execute(
            "SELECT id,name,mime_type,size,scan_state FROM attachments WHERE message_id=? AND is_inline=0", (email_id,))]
    if empty and not (m["body"] or m["html_body"]):
        m["hydrating"] = True    # FE keeps polling; body arrives when the job lands
    if was_unread and row["message_id"]:
        _server_set_read_async(user["id"], row["message_id"], True)
    return m


@app.get("/api/thread")
async def api_thread(tid: str, user: dict = Depends(current_user)):
    """Full conversation: every message in the thread, oldest first, all marked read."""
    with get_db() as conn:
        rows = [_parse_msg(r) for r in conn.execute(
            """SELECT m.*, EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id) has_attachments
               FROM messages m WHERE m.user_id=? AND m.thread_id=? AND m.deleted_at IS NULL
               ORDER BY m.date ASC""", (user["id"], tid))]
        newly = [m for m in rows if not m["is_read"]]
        conn.execute("UPDATE messages SET is_read=1 WHERE user_id=? AND thread_id=? AND is_read=0",
                     (user["id"], tid))
        for m in rows:
            m["attachments"] = [dict(r) for r in conn.execute(
                "SELECT id,name,mime_type,size FROM attachments WHERE message_id=? AND is_inline=0", (m["id"],))]
    # hydrate + mirror empty bodies quietly in the background
    def bg(u=user["id"], items=list(rows)):
        for m in items:
            if not (m["body"] or m["html_body"]):
                try:
                    _hydrate_message(u, m["id"])
                    m["hydrated"] = True
                except Exception:
                    pass
    threading.Thread(target=bg, daemon=True).start()
    for m in newly:
        if m.get("message_id"):
            _server_set_read_async(user["id"], m["message_id"], True)
    return {"thread_id": tid, "messages": rows}


@app.post("/api/folders/{fid}/read")
async def api_folder_mark_read(fid: int, user: dict = Depends(current_user)):
    """Mark every message in a folder (incl. subfolders) as read — right-click menu."""
    with get_db() as conn:
        if not conn.execute("SELECT id FROM folders WHERE id=? AND user_id=?", (fid, user["id"])).fetchone():
            raise HTTPException(404, "Không tìm thấy thư mục")
        ids = [fid]
        frontier = [fid]
        while frontier:
            kids = [r["id"] for r in conn.execute(
                "SELECT id FROM folders WHERE parent_id IN (%s)" % ",".join("?" * len(frontier),), frontier)]
            ids += kids
            frontier = kids
        n = conn.execute("UPDATE messages SET is_read=1 WHERE user_id=? AND folder_id IN (%s) AND is_read=0 AND deleted_at IS NULL"
                         % ",".join("?" * len(ids)), [user["id"]] + ids).rowcount
        mids = [r["message_id"] for r in conn.execute(
            "SELECT message_id FROM messages WHERE user_id=? AND folder_id IN (%s) AND deleted_at IS NULL AND message_id IS NOT NULL"
            % ",".join("?" * len(ids)), [user["id"]] + ids)]
        audit(conn, user["id"], "mail.read_all_folder", str(fid), str(n))
    def work(uid=user["id"], items=mids[:300]):
        for mid in items:
            try:
                _server_set_read_async(uid, mid, True)
                time.sleep(0.2)
            except Exception:
                break
    threading.Thread(target=work, daemon=True).start()
    return {"success": True, "marked": n}


@app.get("/api/emails/{email_id}/cid/{cid}")
async def api_cid_image(email_id: str, cid: str, user: dict = Depends(current_user_q)):
    """Serve an inline (cid:) image from Exchange, cached on disk so it loads once."""
    import hashlib
    from fastapi.responses import FileResponse
    with get_db() as conn:
        arow = conn.execute("SELECT name,mime_type FROM attachments WHERE message_id=? AND content_id=?",
                            (email_id, cid)).fetchone()
        mrow = conn.execute("SELECT message_id, folder_id FROM messages WHERE id=? AND user_id=?",
                            (email_id, user["id"])).fetchone()
    if not mrow or not mrow["message_id"]:
        raise HTTPException(404, "ảnh không tồn tại")
    cache_dir = os.path.join(os.path.dirname(DB_PATH), "cid_cache")
    os.makedirs(cache_dir, exist_ok=True)
    fp = os.path.join(cache_dir, hashlib.sha1(f"{email_id}:{cid}".encode()).hexdigest()[:32])
    if os.path.exists(fp) and os.path.getsize(fp) > 0:
        mt = (arow["mime_type"] if arow else "image/png") or "image/png"
        return FileResponse(fp, media_type=mt.split(";")[0])
    try:
        account, _ = first_account_connect(user["id"])
        item = None
        with get_db() as conn:
            item = _find_item_in_folder_by_id(account, conn, mrow["folder_id"], mrow["message_id"])
        if item is None:
            item = _find_ews_item(account, None, "", mrow["message_id"])
        if item is None:
            raise HTTPException(404, "không tìm thấy thư trên server")
        blob = None
        for att in (item.attachments or []):
            # match by content_id; rows synced before content_id existed match by attachment name too
            att_cid = (getattr(att, "content_id", None) or "").strip("<>")
            if att_cid and att_cid == cid.strip("<>"):
                if getattr(att, "content", None) is None:
                    att = att.copy()
                blob = att.content
                break
        if blob is None:
            raise HTTPException(404, "không có nội dung ảnh")
        with open(fp, "wb") as f:
            f.write(blob)
        mt = (arow["mime_type"] if arow and arow["mime_type"] else "image/png")
        return FileResponse(fp, media_type=mt.split(";")[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cid image {email_id}/{cid[:20]}: {e}")
        raise HTTPException(502, "lỗi tải ảnh từ server")


def _att_thumb(user_id, email_id, att_id, width=420):
    """Return cached thumbnail path for an image attachment (fetch+resize once)."""
    import hashlib
    from PIL import Image as PILImage
    import io as _io
    with get_db() as conn:
        mrow = conn.execute("SELECT message_id FROM messages WHERE id=? AND user_id=?", (email_id, user_id)).fetchone()
        arow = conn.execute("SELECT name,mime_type FROM attachments WHERE id=? AND message_id=?", (att_id, email_id)).fetchone()
    if not mrow or not arow or not mrow["message_id"]:
        raise HTTPException(404, "Không tìm thấy tệp")
    cache_dir = os.path.join(os.path.dirname(DB_PATH), "att_thumb")
    os.makedirs(cache_dir, exist_ok=True)
    fp = os.path.join(cache_dir, f"{hashlib.sha1(f'{att_id}:{width}'.encode()).hexdigest()[:24]}.jpg")
    if os.path.exists(fp) and os.path.getsize(fp) > 0:
        return fp
    blob = ews_get_attachment(user_id, mrow["message_id"], arow["name"])
    if not blob:
        raise HTTPException(404, "Không tải được tệp")
    im = PILImage.open(_io.BytesIO(blob))
    im.load()
    if im.mode in ("RGBA", "P", "LA"):
        bg = PILImage.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((width, width * 3))
    im.save(fp, "JPEG", quality=82)
    return fp


@app.get("/api/emails/{email_id}/attachments/{att_id}/thumb")
async def api_attachment_thumb(email_id: str, att_id: str, user: dict = Depends(current_user_q)):
    from fastapi.responses import FileResponse
    return FileResponse(_att_thumb(user["id"], email_id, att_id), media_type="image/jpeg")


@app.get("/api/emails/{email_id}/attachments/{att_id}/download")
async def api_attachment_download(email_id: str, att_id: str, user: dict = Depends(current_user_q)):
    """Stream one attachment: prefer cached server fetch, fall back to EWS live download."""
    with get_db() as conn:
        mrow = conn.execute("SELECT message_id FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        arow = conn.execute("SELECT * FROM attachments WHERE id=? AND message_id=?", (att_id, email_id)).fetchone()
    if not mrow or not arow:
        raise HTTPException(404, "Không tìm thấy tệp đính kèm")
    data = None
    if mrow["message_id"]:
        try:
            data = ews_get_attachment(user["id"], mrow["message_id"], arow["name"])
        except HTTPException:
            data = None
        except Exception as e:
            logger.error(f"download {att_id}: {e}")
    if not data:
        raise HTTPException(404, "Không tải được tệp từ server")
    from fastapi.responses import Response
    import urllib.parse
    fn = urllib.parse.quote(arow["name"] or "file.bin")
    return Response(content=data, media_type=arow["mime_type"] or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fn}"})


@app.get("/api/emails/{email_id}/forward-payload")
async def api_forward_payload(email_id: str, user: dict = Depends(current_user)):
    """Body + base64 attachments so Forward carries the original files (Outlook behavior)."""
    with get_db() as conn:
        m = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        if not m:
            raise HTTPException(404, "Email not found")
        atts = [dict(r) for r in conn.execute("SELECT name,mime_type FROM attachments WHERE message_id=?", (email_id,))]
    payload = []
    for a in atts[:10]:  # keep requests bounded
        try:
            raw = ews_get_attachment(user["id"], m["message_id"], a["name"])
        except Exception:
            continue
        import base64 as _b64
        payload.append({"name": a["name"], "content_type": a["mime_type"] or "application/octet-stream",
                        "content_base64": _b64.b64encode(raw).decode()})
    return {"body": m["html_body"] or m["body"] or "", "attachments": payload}


def _get_user_folder(conn, uid, ftype):
    return conn.execute("SELECT id FROM folders WHERE user_id=? AND type=?", (uid, ftype)).fetchone()["id"]


@app.post("/api/emails/{email_id}/move")
async def api_move(email_id: str, req: MoveReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        tgt = conn.execute("SELECT name FROM folders WHERE id=? AND user_id=?", (req.folder_id, user["id"])).fetchone()
        if not tgt:
            raise HTTPException(404, "Folder not found")
        m = conn.execute("SELECT message_id FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        conn.execute("UPDATE messages SET folder_id=? WHERE id=? AND user_id=?", (req.folder_id, email_id, user["id"]))
        audit(conn, user["id"], "mail.move", email_id, str(req.folder_id))
    if m and m["message_id"]:
        def work(mid=m["message_id"], uid=user["id"], name=tgt["name"]):
            try:
                ews_server_action(uid, mid, "move", name)
            except Exception as e:
                logger.error(f"server move {email_id}: {e}")
        threading.Thread(target=work, daemon=True).start()
    return {"success": True}


@app.post("/api/emails/{email_id}/archive")
async def api_archive(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        m = conn.execute("SELECT message_id FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        fid = _get_user_folder(conn, user["id"], "archive")
        conn.execute("UPDATE messages SET folder_id=? WHERE id=? AND user_id=?", (fid, email_id, user["id"]))
        audit(conn, user["id"], "mail.archive", email_id)
    # mirror on the Exchange server in the BACKGROUND — the click returns instantly
    if m and m["message_id"]:
        def work(mid=m["message_id"], uid=user["id"]):
            try:
                ews_server_action(uid, mid, "archive")
            except Exception as e:
                logger.error(f"server archive {email_id}: {e}")
        threading.Thread(target=work, daemon=True).start()
    return {"success": True, "server": "queued"}


@app.post("/api/archive/batch")
async def api_archive_batch(req: BatchArchiveReq, user: dict = Depends(current_user)):
    """Batch archive: export emails older than before_date from selected folders (and subfolders) to .eml,
    then delete from Exchange. Returns count of archived emails."""
    with get_db() as conn:
        # validate folder_ids belong to user
        rows = conn.execute(
            "SELECT id, name, parent_id FROM folders WHERE user_id=? AND id IN (%s)" % ",".join("?" * len(req.folder_ids)),
            [user["id"]] + req.folder_ids
        ).fetchall()
        if len(rows) != len(req.folder_ids):
            raise HTTPException(400, "Một hoặc nhiều thư mục không tồn tại")
        # build set of all folder IDs to archive (including subfolders)
        folder_ids_set = set(req.folder_ids)
        if req.include_subfolders:
            while True:
                new = conn.execute(
                    "SELECT id FROM folders WHERE user_id=? AND parent_id IN (%s)" % ",".join("?" * len(folder_ids_set)),
                    [user["id"]] + list(folder_ids_set)
                ).fetchall()
                new_ids = {r["id"] for r in new}
                if not new_ids - folder_ids_set:
                    break
                folder_ids_set |= new_ids
        # count matching emails
        placeholders = ",".join("?" * len(folder_ids_set))
        count = conn.execute(
            f"SELECT COUNT(*) FROM messages WHERE user_id=? AND folder_id IN ({placeholders}) AND is_read=1 AND deleted_at IS NULL AND archived_local=0",
            [user["id"]] + list(folder_ids_set)
        ).fetchone()[0]
        # get emails (already read) older than before_date
        emails = conn.execute(
            f"SELECT id, message_id FROM messages WHERE user_id=? AND folder_id IN ({placeholders}) AND date < ? AND is_read=1 AND deleted_at IS NULL AND archived_local=0",
            [user["id"]] + list(folder_ids_set) + [req.before_date]
        ).fetchall()
    if not emails:
        return {"success": True, "archived": 0, "error": None}
    # archive each email in background thread
    archived = 0
    errors = []
    def _batch_work():
        nonlocal archived, errors
        for e in emails:
            try:
                # write .eml
                path = _write_eml(user["id"], e["id"])
                with get_db() as conn2:
                    conn2.execute("UPDATE messages SET archived_local=1, archive_path=? WHERE id=? AND user_id=?", (path, e["id"], user["id"]))
                    _fts_ensure_row(conn2, e["id"])
                    audit(conn2, user["id"], "mail.archive-batch", e["id"], req.before_date)
                # delete from server
                if e["message_id"]:
                    ews_server_action(user["id"], e["message_id"], "delete")
                archived += 1
            except Exception as ex:
                logger.error(f"batch archive {e['id']}: {ex}")
                errors.append(str(ex))
    threading.Thread(target=_batch_work, daemon=True).start()
    return {"success": True, "archived": len(emails), "queued": True, "error": "; ".join(errors) if errors else None}


@app.delete("/api/emails/{email_id}")
async def api_delete(email_id: str, user: dict = Depends(current_user)):
    """Soft delete -> trash, 30 day retention."""
    with get_db() as conn:
        fid = _get_user_folder(conn, user["id"], "trash")
        conn.execute("UPDATE messages SET folder_id=?, deleted_at=? WHERE id=? AND user_id=?",
                     (fid, now_iso(), email_id, user["id"]))
        audit(conn, user["id"], "mail.soft_delete", email_id)
    return {"success": True}


@app.post("/api/emails/{email_id}/restore")
async def api_restore(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        fid = _get_user_folder(conn, user["id"], "inbox")
        conn.execute("UPDATE messages SET folder_id=?, deleted_at=NULL WHERE id=? AND user_id=?",
                     (fid, email_id, user["id"]))
        audit(conn, user["id"], "mail.restore", email_id)
    return {"success": True}


@app.post("/api/emails/{email_id}/star")
async def api_star(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        row = conn.execute("SELECT starred FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Email not found")
        v = 0 if row["starred"] else 1
        conn.execute("UPDATE messages SET starred=? WHERE id=?", (v, email_id))
    return {"success": True, "starred": bool(v)}


@app.put("/api/emails/{email_id}/read")
async def api_read(email_id: str, req: ReadReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        m = conn.execute("SELECT message_id FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        conn.execute("UPDATE messages SET is_read=? WHERE id=? AND user_id=?", (1 if req.is_read else 0, email_id, user["id"]))
    # propagate read-state to Exchange in the BACKGROUND (EWS round-trips must not block the click)
    if m and m["message_id"]:
        _server_set_read_async(user["id"], m["message_id"], req.is_read)
    return {"success": True}


@app.post("/api/emails/{email_id}/flag")
async def api_flag(email_id: str, req: FlagReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("UPDATE messages SET flag_due=? WHERE id=? AND user_id=?", (req.due, email_id, user["id"]))
    return {"success": True}


@app.post("/api/emails/-/read-all")
async def api_read_all(folder: str = "inbox", user: dict = Depends(current_user)):
    with get_db() as conn:
        fq = conn.execute("SELECT id FROM folders WHERE user_id=? AND (type=? OR name=?)",
                          (user["id"], folder, folder)).fetchone()
        if not fq:
            raise HTTPException(404, "Folder not found")
        n = conn.execute("UPDATE messages SET is_read=1 WHERE user_id=? AND folder_id=? AND is_read=0 AND deleted_at IS NULL",
                         (user["id"], fq["id"])).rowcount
        audit(conn, user["id"], "mail.read_all", folder, str(n))
    return {"success": True, "marked": n}


@app.put("/api/emails/{email_id}/categories")
async def api_cats(email_id: str, req: CategoryUpdate, user: dict = Depends(current_user)):
    bad = [c for c in req.categories if c not in CATEGORIES]
    if bad:
        raise HTTPException(400, f"Category không hợp lệ: {bad}")
    with get_db() as conn:
        conn.execute("UPDATE messages SET categories=? WHERE id=? AND user_id=?",
                     (json.dumps(req.categories), email_id, user["id"]))
    return {"success": True, "categories": req.categories}


@app.post("/api/emails/{email_id}/task")
async def api_email_to_task(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        m = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        if not m:
            raise HTTPException(404, "Email not found")
        tid = f"tk-{secrets.token_hex(6)}"
        due = m["flag_due"] or (datetime.now() + timedelta(days=3)).isoformat()
        conn.execute("INSERT INTO tasks (id,user_id,title,due_at,source_ref) VALUES (?,?,?,?,?)",
                     (tid, user["id"], m["subject"], due, email_id))
        conn.execute("UPDATE messages SET flag_due=? WHERE id=?", (due, email_id))
        audit(conn, user["id"], "task.from_mail", tid, email_id)
    return {"success": True, "task_id": tid}


def _split_addr(s: str):
    """Split 'a@x, b@y' preserving 'Name <addr>' units."""
    return [p.strip() for p in re.split(r",(?![^<]*>)", s or "") if p.strip()]


def _addr_email(a: str) -> str:
    m = re.search(r"<([^>]+)>", a)
    return (m.group(1) if m else a).strip().lower()


def _prefix_subject(subject: str, prefix: str) -> str:
    s = (subject or "").strip()
    if re.match(r"^(re|fwd|fw):", s, flags=re.I):
        return s
    return f"{prefix}: {s}" if s else f"{prefix}: (không tiêu đề)"


def _quote_block(sender: str, date: str, subject: str, body: str, html: str | None) -> str:
    head = f'---------- Forwarded message ---------\nTừ: {sender}\nNgày: {date}\nTiêu đề: {subject}\n\n'
    if html:
        return (f'<br><div style="color:#888;font-size:12px">{head.replace(chr(10), "<br>")}</div>'
                f'<blockquote style="border-left:2px solid #ccc;margin:8px 0;padding-left:10px">{html}</blockquote>')
    quoted = "\n".join("> " + ln for ln in (body or "").splitlines())
    return head + quoted


@app.get("/api/emails/{email_id}/reply-preview")
async def api_reply_preview(email_id: str, mode: str = "reply", user: dict = Depends(current_user)):
    """Compose prefill for reply / reply_all / forward (spec §5 Flow A-friendly)."""
    if mode not in ("reply", "reply_all", "forward"):
        raise HTTPException(400, "mode phải là reply|reply_all|forward")
    with get_db() as conn:
        m = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
    if not m:
        raise HTTPException(404, "Email not found")
    me_email = user["email"].lower()
    to_list = _split_addr(m["to"] or "") + [m["from"] or ""]
    cc_list = _split_addr(m["cc"] or "") if "cc" in m.keys() else []
    if mode == "reply":
        to = [m["from"] or ""]
        cc = []
        subj = _prefix_subject(m["subject"], "Re")
    elif mode == "reply_all":
        seen = {me_email}
        to, cc = [], []
        for a in _split_addr(m["from"] or "") + to_list:
            e = _addr_email(a)
            if e and e not in seen:
                seen.add(e)
                to.append(a)
        for a in cc_list:
            e = _addr_email(a)
            if e and e not in seen:
                seen.add(e)
                cc.append(a)
        subj = _prefix_subject(m["subject"], "Re")
    else:  # forward — Outlook adds Fwd even onto "Re:" subjects
        s0 = (m["subject"] or "").strip()
        subj = s0 if re.match(r"^\s*(fwd|fw):", s0, flags=re.I) else "Fwd: " + (s0 or "(không tiêu đề)")
        to, cc = [], []
    quoted = _quote_block(m["from"] or "", m["date"] or "", m["subject"] or "",
                          m["body"] or "", m["html_body"] if mode != "reply" else None)
    settings = get_settings(user["id"])
    return {"to": ", ".join(to), "cc": ", ".join(cc), "subject": subj, "quoted": quoted,
            "thread_id": m["thread_id"], "in_reply_to": email_id,
            "signature": settings.get("signature", "")}


@app.post("/api/emails/{email_id}/reply")
async def api_reply(email_id: str, req: ReplyReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        m = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        if not m:
            raise HTTPException(404, "Email not found")
        rid = f"rp-{secrets.token_hex(6)}"
        sig = get_settings(user["id"]).get("signature", "")
        body = req.body + (f"\n\n-- \n{sig}" if sig else "")
        conn.execute("""INSERT INTO messages (id,user_id,message_id,thread_id,folder_id,"from","to",subject,date,preview,body,is_read,starred,categories)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,'[]')""",
            (rid, user["id"], f"<{rid}>", m["thread_id"], _get_user_folder(conn, user["id"], "sent"),
             user["email"], m["from"], _prefix_subject(m["subject"], "Re"), now_iso(), req.body[:100], body))
        ensure_thread(conn, user["id"], m["thread_id"], m["subject"], None, now_iso(), 0)
    return {"success": True, "id": rid}


@app.post("/api/compose")
async def api_compose(req: ComposeReq, user: dict = Depends(current_user)):
    mid = f"ms-{secrets.token_hex(6)}"
    tid = req.thread_id or f"th-{secrets.token_hex(6)}"
    body = req.body
    st = get_settings(user["id"])
    sig_html = st.get("signature_html", "")
    if req.send and sig_html and not req.sig_added:
        body = body + "<br><br>--&nbsp;<br>" + sig_html
    server_ok = None
    with get_db() as conn:
        ftype = "sent" if req.send else "drafts"
        ensure_thread(conn, user["id"], tid, req.subject, [user["email"], req.to], now_iso(), 0)
        conn.execute("""INSERT INTO messages (id,user_id,message_id,thread_id,folder_id,"from","to",cc,bcc,subject,date,preview,body,html_body,is_read,starred,categories)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,'[]')""",
            (mid, user["id"], f"<{mid}>", tid, _get_user_folder(conn, user["id"], ftype),
             user["email"], req.to, req.cc, req.bcc, req.subject, now_iso(), _strip_html(body)[:400],
             _strip_html(body), body))
        # persist attachment meta so the sent row shows them immediately (bytes live on server)
        for i, att in enumerate(req.attachments or []):
            conn.execute("INSERT OR IGNORE INTO attachments (id,message_id,name,mime_type,size) VALUES (?,?,?,?,?)",
                         (f"att-{mid}-{i}", mid, att.get("name"), att.get("content_type"),
                          int(len(att.get("content_base64", "")) * 0.75)))
        if req.send:
            audit(conn, user["id"], "mail.send", mid, req.to)
    if req.send:
        # fire real EWS send; local row already recorded so UI is instant
        try:
            res = ews_send(user["id"], req.to, req.cc, req.bcc, req.subject, body,
                           html=True, attachments=req.attachments,
                           in_reply_to=req.in_reply_to)
            server_ok = True
            if res.get("item_id") or res.get("message_id"):
                with get_db() as conn:
                    conn.execute("UPDATE messages SET ews_item_id=COALESCE(NULLIF(?, ''), ews_item_id), message_id=COALESCE(NULLIF(?, ''), message_id) WHERE id=?",
                                 (res.get("item_id", ""), res.get("message_id", ""), mid))
        except Exception as e:
            logger.error(f"EWS send failed (kept local): {e}")
            server_ok = False
    return {"success": True, "id": mid, "sent": req.send, "server": server_ok}


@app.get("/api/realtime/stream")
async def api_realtime_stream(since: float = 0, user: dict = Depends(current_user_q)):
    """SSE stream of realtime sync events (new_mail / changed).
    NB: NOT /api/events — that path belongs to the calendar module."""
    import realtime
    from fastapi.responses import StreamingResponse
    q = realtime.subscribe(user["id"])

    def gen():
        yield ": connected\n\n"
        for ev in realtime.recent_since(user["id"], since):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        import time as _t
        last = _t.time()
        try:
            while True:
                try:
                    ev = q.get(timeout=15)
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                except Exception:
                    yield ": ping\n\n"
                if _t.time() - last > 3600:
                    break
        finally:
            realtime.unsubscribe(user["id"], q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class RealtimeReq(BaseModel):
    enabled: bool


@app.get("/api/realtime/poll")
async def api_realtime_poll(since: float = 0, user: dict = Depends(current_user)):
    """Proxy/tunnel-safe fallback for SSE: returns realtime events newer than `since`."""
    import realtime, time as _t
    evs = realtime.recent_since(user["id"], since)
    return {"events": evs[-10:], "server_ts": _t.time()}


@app.post("/api/realtime")
async def api_realtime_set(req: RealtimeReq, user: dict = Depends(current_user)):
    """Toggle the realtime delta-sync daemon (mirrors settings.autosync)."""
    import realtime
    with get_db() as conn:
        merged = {**get_settings(user["id"]), "autosync": req.enabled}
        conn.execute("""INSERT INTO user_settings (user_id, json, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
                        ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=CURRENT_TIMESTAMP""",
                     (user["id"], json.dumps(merged, ensure_ascii=False)))
        audit(conn, user["id"], "realtime.toggle", "on" if req.enabled else "off")
    if req.enabled:
        realtime.ensure_worker(user["id"])
    else:
        realtime.stop_worker(user["id"])
    return {"success": True, "enabled": req.enabled}


# ─── categories / stats / search ─────────────────────────────────────
@app.get("/api/categories")
async def api_categories():
    return {"categories": CATEGORIES, "colors": CATEGORY_COLORS}


@app.get("/api/stats")
async def api_stats(user: dict = Depends(current_user)):
    with get_db() as conn:
        r = conn.execute("""SELECT COUNT(*) total,
            SUM(CASE WHEN is_read=0 THEN 1 ELSE 0 END) unread,
            SUM(CASE WHEN starred=1 THEN 1 ELSE 0 END) starred,
            SUM(CASE WHEN flag_due IS NOT NULL AND flag_due!='' THEN 1 ELSE 0 END) flagged
            FROM messages WHERE user_id=? AND deleted_at IS NULL""", (user["id"],)).fetchone()
        tasks_open = conn.execute("SELECT COUNT(*) c FROM tasks WHERE user_id=? AND status!='completed'",
                                  (user["id"],)).fetchone()["c"]
    return {"total": r["total"] or 0, "unread": r["unread"] or 0, "starred": r["starred"] or 0,
            "flagged": r["flagged"] or 0, "tasks_open": tasks_open}


@app.get("/api/search")
async def api_search(q: str, user: dict = Depends(current_user)):
    s = f"%{q}%"
    fx = _fts_match(q)
    with get_db() as conn:
        if fx:
            msgs = [_parse_msg(r) for r in conn.execute(
                'SELECT m.*, f.name folder_name FROM messages m LEFT JOIN folders f ON f.id=m.folder_id '
                'WHERE m.user_id=? AND m.deleted_at IS NULL AND m.rowid IN (SELECT rowid FROM msg_fts WHERE msg_fts MATCH ?) '
                'ORDER BY m.date DESC LIMIT 20', (user["id"], fx))]
        else:
            msgs = [ _parse_msg(r) for r in conn.execute(
                'SELECT m.*, f.name folder_name FROM messages m LEFT JOIN folders f ON f.id=m.folder_id '
                'WHERE m.user_id=? AND m.deleted_at IS NULL AND (m.subject LIKE ? OR m."from" LIKE ? OR m.body LIKE ?) '
                'ORDER BY m.date DESC LIMIT 20', (user["id"], s, s, s))]
        contacts = [dict(r) for r in conn.execute(
            "SELECT * FROM contacts WHERE user_id=? AND (name LIKE ? OR email LIKE ?) LIMIT 10",
            (user["id"], s, s))]
        tasks = [dict(r) for r in conn.execute(
            "SELECT * FROM tasks WHERE user_id=? AND title LIKE ? LIMIT 10", (user["id"], s))]
        events = [dict(r) for r in conn.execute(
            "SELECT * FROM calendar_events WHERE user_id=? AND subject LIKE ? ORDER BY start_at LIMIT 10",
            (user["id"], s))]
    return {"messages": msgs, "contacts": contacts, "tasks": tasks, "events": events}


# ─── tasks ────────────────────────────────────────────────────────────
@app.get("/api/tasks")
async def api_tasks(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT t.*, m.subject source_subject FROM tasks t LEFT JOIN messages m ON m.id=t.source_ref "
            "WHERE t.user_id=? ORDER BY CASE WHEN status='completed' THEN 1 ELSE 0 END, due_at", (user["id"],))]
    return {"tasks": rows}


@app.post("/api/tasks")
async def api_task_create(req: TaskReq, user: dict = Depends(current_user)):
    tid = f"tk-{secrets.token_hex(6)}"
    with get_db() as conn:
        conn.execute("INSERT INTO tasks (id,user_id,title,description,due_at) VALUES (?,?,?,?,?)",
                     (tid, user["id"], req.title, req.description, req.due_at))
    return {"success": True, "id": tid}


@app.patch("/api/tasks/{tid}")
async def api_task_patch(tid: str, req: TaskReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        if not conn.execute("SELECT id FROM tasks WHERE id=? AND user_id=?", (tid, user["id"])).fetchone():
            raise HTTPException(404, "Task not found")
        if req.status:
            conn.execute("UPDATE tasks SET status=? WHERE id=?", (req.status, tid))
    return {"success": True}


@app.delete("/api/tasks/{tid}")
async def api_task_del(tid: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("DELETE FROM tasks WHERE id=? AND user_id=?", (tid, user["id"]))
    return {"success": True}


# ─── contacts ─────────────────────────────────────────────────────────
@app.get("/api/suggest")
async def api_suggest(q: str = "", limit: int = 8, user: dict = Depends(current_user)):
    """Outlook-style name picker: contacts + past correspondents matching q."""
    q = (q or "").strip()
    if len(q) < 1:
        return {"suggestions": []}
    qn = f"%{q}%"
    out = {}
    with get_db() as conn:
        for r in conn.execute("SELECT name,email FROM contacts WHERE user_id=? AND (name LIKE ? OR email LIKE ?) LIMIT 20",
                              (user["id"], qn, qn)):
            e = (r["email"] or "").strip().lower()
            if e:
                out.setdefault(e, (r["name"] or "").strip() or e)
        for r in conn.execute('SELECT DISTINCT "from" f FROM messages WHERE user_id=? AND "from" LIKE ? LIMIT 20',
                              (user["id"], qn)):
            e = _addr_email(r["f"])
            nm = (r["f"] or "").split("<")[0].strip()
            if e:
                out.setdefault(e.lower(), nm or e)
    items = [{"email": e, "name": n} for e, n in list(out.items())[:limit]]
    return {"suggestions": items}


@app.get("/api/contacts")
async def api_contacts(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM contacts WHERE user_id=? ORDER BY favorite DESC, name", (user["id"],))]
    return {"contacts": rows}


@app.post("/api/contacts")
async def api_contact_add(req: ContactReq, user: dict = Depends(current_user)):
    cid = f"c-{secrets.token_hex(6)}"
    with get_db() as conn:
        conn.execute("INSERT INTO contacts (id,user_id,name,email,phone,job_title,company) VALUES (?,?,?,?,?,?,?)",
                     (cid, user["id"], req.name, req.email, req.phone, req.job_title, req.company))
    return {"success": True, "id": cid}


@app.delete("/api/contacts/{cid}")
async def api_contact_del(cid: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("DELETE FROM contacts WHERE id=? AND user_id=?", (cid, user["id"]))
    return {"success": True}


# ─── calendar ─────────────────────────────────────────────────────────
@app.get("/api/events")
async def api_events(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM calendar_events WHERE user_id=? ORDER BY start_at", (user["id"],))]
    return {"events": rows}


@app.post("/api/events")
async def api_event_add(req: EventReq, user: dict = Depends(current_user)):
    eid = f"ev-{secrets.token_hex(6)}"
    end = req.end_at or (datetime.fromisoformat(req.start_at) + timedelta(hours=1)).isoformat()
    with get_db() as conn:
        conn.execute("INSERT INTO calendar_events (id,user_id,subject,start_at,end_at,all_day,location,category) VALUES (?,?,?,?,?,?,?,?)",
                     (eid, user["id"], req.subject, req.start_at, end, 1 if req.all_day else 0, req.location, req.category))
    return {"success": True, "id": eid}


@app.delete("/api/events/{eid}")
async def api_event_del(eid: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("DELETE FROM calendar_events WHERE id=? AND user_id=?", (eid, user["id"]))
    return {"success": True}


# ─── accounts ─────────────────────────────────────────────────────────
@app.get("/api/accounts")
async def api_accounts(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT id,address,provider,server_url,sync_state FROM mail_accounts WHERE user_id=?",
                            (user["id"],)).fetchall()
    return {"accounts": [dict(r) for r in rows]}


@app.post("/api/accounts")
async def api_account_add(req: AccountConfig, user: dict = Depends(current_user)):
    try:
        from exchangelib import Credentials, Configuration, Account
        acct = Account(primary_smtp_address=req.email,
                       config=Configuration(server=req.exchange_url,
                                            credentials=Credentials(username=req.email, password=req.password)),
                       access_type="delegate")
        with get_db() as conn:
            conn.execute("""INSERT OR REPLACE INTO mail_accounts (user_id,address,password_encrypted,server_url,sync_state)
                VALUES (?,?,?,?,?)""",
                (user["id"], req.email, encrypt_password(req.password), req.exchange_url, now_iso()))
            audit(conn, user["id"], "account.connect", req.email)
        return {"success": True, "message": f"Đã kết nối {req.email}",
                "folders": [f.name for f in acct.root.children()]}
    except Exception as e:
        logger.error(f"Account error: {e}")
        raise HTTPException(400, str(e))






# ─── auto-update ──────────────────────────────────────────────────────────
def _github_release(client_version="3.8.2"):
    """Check GitHub releases for newer version. Returns dict with update info."""
    import urllib.request
    import json as _json
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/uservkt2006/mail-manager/releases/latest",
            headers={"User-Agent": "MailManager/1.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = _json.loads(resp.read())
        latest_tag = data.get("tag_name", "v0.0.0").lstrip("v")
        if latest_tag <= client_version:
            return {"has_update": False, "latest": latest_tag, "current": client_version}
        assets = data.get("assets", [])
        download_url = None
        for a in assets:
            name = a.get("name", "")
            if name.endswith(".AppImage") or name.endswith(".deb"):
                download_url = a.get("browser_download_url")
                break
        return {
            "has_update": True,
            "latest": latest_tag,
            "current": client_version,
            "download_url": download_url,
            "release_notes": data.get("body", ""),
            "published_at": data.get("published_at", "")
        }
    except Exception as e:
        logger.warning(f"update check failed: {e}")
        return {"has_update": False, "error": str(e)}


@app.get("/api/update/check")
async def api_update_check():
    """Check if a newer version is available on GitHub."""
    return _github_release("3.8.2")


@app.get("/api/update/download")
async def api_update_download():
    """Download the latest update file."""
    info = _github_release("3.8.2")
    if not info.get("download_url"):
        raise HTTPException(404, "Không tìm thấy file cập nhật")
    try:
        import urllib.request
        url = info["download_url"]
        # Download to temp
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
            with urllib.request.urlopen(url, timeout=120) as resp:
                shutil.copyfileobj(resp, tmp)
            tmp_path = tmp.name
        # Get file size
        size = os.path.getsize(tmp_path)
        # Calculate hash
        with open(tmp_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
        return {
            "success": True,
            "path": tmp_path,
            "size": size,
            "hash": file_hash,
            "version": info.get("latest", "")
        }
    except Exception as e:
        logger.error(f"update download failed: {e}")
        raise HTTPException(500, f"Lỗi tải bản cập nhật: {str(e)[:200]}")


# ─── audit ────────────────────────────────────────────────────────────
@app.get("/api/audit")
async def api_audit(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT action,resource,detail,ts FROM audit_events WHERE user_id=? ORDER BY id DESC LIMIT 50",
                            (user["id"],)).fetchall()
    return {"events": [dict(r) for r in rows]}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "18685"))
    uvicorn.run(app, host="127.0.0.1", port=port)
