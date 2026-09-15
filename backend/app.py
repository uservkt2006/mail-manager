"""Mail Manager v3.0 — multi-user, spec-aligned schema.

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
from datetime import datetime, timedelta
from contextlib import contextmanager

logging.basicConfig(level=logging.INFO)
logging.getLogger("exchangelib").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

app = FastAPI(title="Mail Manager", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# SQLite database path (MM_DB_PATH lets tests use an isolated DB)
DB_PATH = os.environ.get("MM_DB_PATH") or os.path.expanduser("~/.mail_manager/mail_manager.db")
KEY_PATH = os.path.expanduser("~/.mail_manager/key")
SCHEMA_VERSION = 4

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


# ─── db ───────────────────────────────────────────────────────────────
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id),
    name TEXT, mime_type TEXT, size INTEGER,
    storage_ref TEXT, scan_state TEXT DEFAULT 'pending'
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


def init_db():
    with get_db() as conn:
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
        # additive column for pre-v4 DBs (CREATE IF NOT EXISTS won't add it)
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN html_body TEXT")
        except sqlite3.OperationalError:
            pass
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        # MM_DEMO=0 -> clean first-run (wizard), no seeded demo accounts
        if not has_users and os.environ.get("MM_DEMO", "1") != "0":
            seed(conn)


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
        ensure_thread(conn, uid, f"th-sent-{uid}", "Gửi từ Mail Manager", None, t(100), 0)
        conn.execute("""INSERT INTO messages (id,user_id,message_id,thread_id,folder_id,"from","to",subject,date,preview,body,is_read,starred,categories)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"sent-{uid}", uid, "<s1>", f"th-sent-{uid}", folders[(uid, "sent")], "me", "other@x.com",
             "Gửi từ Mail Manager", t(100), "Test đã gửi", "Nội dung đã gửi", 1, 0, "[]"))

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
    send: bool = True
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None


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
    rows = conn.execute("SELECT * FROM folders WHERE user_id=? ORDER BY type='user', name", (user_id,)).fetchall()
    nodes = {r["id"]: {"id": r["id"], "name": r["name"], "type": r["type"],
                       "parent_id": r["parent_id"], "total": counts.get(r["id"], (0, 0))[0],
                       "unread": counts.get(r["id"], (0, 0))[1], "children": []} for r in rows}
    roots = []
    for n in nodes.values():
        if n["parent_id"] and n["parent_id"] in nodes:
            nodes[n["parent_id"]]["children"].append(n)
        else:
            roots.append(n)
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
    txt = re.sub(r'<[^>]+>', ' ', html or '')
    txt = re.sub(r'&nbsp;?', ' ', txt)
    txt = re.sub(r'[ \t]{2,}', ' ', txt)
    return txt.strip()


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
                        "datetime_received", "message_id", "is_read", "attachments", "has_attachments",
                        "importance")
                        .order_by("-datetime_received")[:FOLDER_SYNC_CAP])
                except Exception as e:
                    logger.error(f"folder {folder.name}: {e}")
                    continue
                for m in items:
                    # generic folders may hold non-message items (Contacts have
                    # datetime_received too — message_id is the real marker)
                    if not hasattr(m, "message_id") or not hasattr(m, "datetime_received"):
                        continue
                    mid = safe_ews_id("ews", aid, m.id)
                    if conn.execute("SELECT id FROM messages WHERE id=?", (mid,)).fetchone():
                        continue
                    try:
                        date = m.datetime_received.isoformat() if m.datetime_received else now_iso()
                    except Exception:
                        continue
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
                    tid = f"th-{normalize_subject(m.subject)}" if m.subject else mid
                    is_read = 1 if getattr(m, "is_read", True) else 0
                    ensure_thread(conn, user_id, tid, m.subject, [sender], date, 1 - is_read)
                    conn.execute(
                        """INSERT OR IGNORE INTO messages
                           (id,user_id,account_id,message_id,thread_id,folder_id,"from","to",subject,date,preview,body,html_body,is_read,starred,categories)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'[]')""",
                        (mid, user_id, aid, m.message_id, tid, local_id, sender,
                         ",".join(getattr(x, "email_address", "") or "" for x in (getattr(m, "to_recipients", None) or [])),
                         m.subject or "(không tiêu đề)", date, text[:160], text, html, is_read))
                    for i, at in enumerate(getattr(m, "attachments", None) or []):
                        conn.execute("INSERT OR IGNORE INTO attachments (id,message_id,name,mime_type,size) VALUES (?,?,?,?,?)",
                                     (f"att-{mid}-{i}", mid, getattr(at, "name", f"file{i}"),
                                      str(getattr(at, "content_type", "application/octet-stream")),
                                      getattr(at, "size", 0) or 0))
                    stats["messages"] += 1
                    seen_threads.add(tid)
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


# ─── auth ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "mail-manager", "version": "3.1.0"}


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
        conn.execute("""INSERT OR REPLACE INTO mail_accounts (user_id,address,password_encrypted,server_url)
                        VALUES (?,?,?,?)""",
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
        return {"token": token, "user": {"id": u["id"], "email": u["email"], "display_name": u["display_name"]}}


@app.post("/api/auth/logout")
async def logout(user: dict = Depends(current_user), x_auth_token: str = Header(default=None)):
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token=?", (x_auth_token,))
    return {"success": True}


@app.get("/api/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"user": user}


# ─── user settings ────────────────────────────────────────────────────
class SettingsReq(BaseModel):
    values: dict


DEFAULT_SETTINGS = {"theme": "dark", "density": "comfortable", "reading_pane": "right",
                    "signature": "", "autosync": False, "sync_interval_min": 5,
                    "default_reply_all": False}


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


# ─── folders ──────────────────────────────────────────────────────────
@app.get("/api/folders")
async def api_folders(user: dict = Depends(current_user)):
    with get_db() as conn:
        return {"tree": folder_tree(user["id"], conn)}


@app.post("/api/folders")
async def api_folder_create(req: FolderCreate, user: dict = Depends(current_user)):
    with get_db() as conn:
        parent = None
        if req.parent_type:
            pr = conn.execute("SELECT id FROM folders WHERE user_id=? AND type=?", (user["id"], req.parent_type)).fetchone()
            parent = pr["id"] if pr else None
        get_or_create_folder(conn, user["id"], "user", req.name, parent)
        audit(conn, user["id"], "folder.create", req.name)
    return {"success": True}


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
    return {"success": True}


# ─── emails ───────────────────────────────────────────────────────────
@app.get("/api/emails")
async def api_emails(folder: str = "inbox", conversation: bool = True, search: str = "",
                     category: str = "", starred: bool = False, flagged: bool = False,
                     limit: int = 50, page: int = 1, user: dict = Depends(current_user)):
    with get_db() as conn:
        q = """SELECT m.*, f.type as folder_type, f.name as folder_name FROM messages m
               LEFT JOIN folders f ON f.id = m.folder_id
               WHERE m.user_id=? AND m.deleted_at IS NULL"""
        params = [user["id"]]
        if folder and folder != "all":
            fq = conn.execute("SELECT id FROM folders WHERE user_id=? AND (type=? OR id=? OR name=?)",
                              (user["id"], folder, folder if folder.isdigit() else -1, folder)).fetchone()
            if not fq:
                raise HTTPException(404, "Folder not found")
            q += " AND m.folder_id=?"; params.append(fq["id"])
        if search:
            q += ' AND (subject LIKE ? OR "from" LIKE ? OR preview LIKE ? OR body LIKE ?)'
            s = f"%{search}%"; params += [s] * 4
        if category:
            q += " AND categories LIKE ?"; params.append(f"%{category}%")
        if starred:
            q += " AND starred=1"
        if flagged:
            q += " AND flag_due IS NOT NULL AND flag_due != ''"
        q += " ORDER BY m.date DESC LIMIT ? OFFSET ?"
        params += [limit, (page - 1) * limit]
        rows = [_parse_msg(r) for r in conn.execute(q, params)]

        if conversation:
            groups = {}
            for m in rows:
                groups.setdefault(m["thread_id"] or m["id"], []).append(m)
            out = [{"thread_id": tid, "email": g[0], "reply_count": len(g) - 1, "replies": g[1:]}
                   for tid, g in groups.items()]
            return {"emails": out, "total": len(out), "conversation": True}
        return {"emails": rows, "total": len(rows), "conversation": False}


@app.get("/api/emails/{email_id}")
async def api_email_get(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM messages WHERE id=? AND user_id=?", (email_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Email not found")
        conn.execute("UPDATE messages SET is_read=1 WHERE id=?", (email_id,))
        m = _parse_msg(row)
        m["is_read"] = True
        m["attachments"] = [dict(r) for r in conn.execute(
            "SELECT id,name,mime_type,size,scan_state FROM attachments WHERE message_id=?", (email_id,))]
        return m


def _get_user_folder(conn, uid, ftype):
    return conn.execute("SELECT id FROM folders WHERE user_id=? AND type=?", (uid, ftype)).fetchone()["id"]


@app.post("/api/emails/{email_id}/move")
async def api_move(email_id: str, req: MoveReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        if not conn.execute("SELECT id FROM folders WHERE id=? AND user_id=?", (req.folder_id, user["id"])).fetchone():
            raise HTTPException(404, "Folder not found")
        conn.execute("UPDATE messages SET folder_id=? WHERE id=? AND user_id=?", (req.folder_id, email_id, user["id"]))
        audit(conn, user["id"], "mail.move", email_id, str(req.folder_id))
    return {"success": True}


@app.post("/api/emails/{email_id}/archive")
async def api_archive(email_id: str, user: dict = Depends(current_user)):
    with get_db() as conn:
        fid = _get_user_folder(conn, user["id"], "archive")
        conn.execute("UPDATE messages SET folder_id=? WHERE id=? AND user_id=?", (fid, email_id, user["id"]))
        audit(conn, user["id"], "mail.archive", email_id)
    return {"success": True}


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


@app.post("/api/emails/{email_id}/flag")
async def api_flag(email_id: str, req: FlagReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("UPDATE messages SET flag_due=? WHERE id=? AND user_id=?", (req.due, email_id, user["id"]))
    return {"success": True}


@app.put("/api/emails/{email_id}/read")
async def api_read(email_id: str, req: ReadReq, user: dict = Depends(current_user)):
    with get_db() as conn:
        conn.execute("UPDATE messages SET is_read=? WHERE id=? AND user_id=?",
                     (1 if req.is_read else 0, email_id, user["id"]))
    return {"success": True}


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
    if req.send:
        sig = get_settings(user["id"]).get("signature", "")
        if sig:
            body = body + f"\n\n-- \n{sig}"
    with get_db() as conn:
        ftype = "sent" if req.send else "drafts"
        ensure_thread(conn, user["id"], tid, req.subject, [user["email"], req.to], now_iso(), 0)
        conn.execute("""INSERT INTO messages (id,user_id,message_id,thread_id,folder_id,"from","to",cc,subject,date,preview,body,is_read,starred,categories)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,'[]')""",
            (mid, user["id"], f"<{mid}>", tid, _get_user_folder(conn, user["id"], ftype),
             user["email"], req.to, req.cc, req.subject, now_iso(), req.body[:100], body))
        if req.send:
            audit(conn, user["id"], "mail.send", mid, req.to)
    return {"success": True, "id": mid, "sent": req.send}


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
    with get_db() as conn:
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


# ─── audit ────────────────────────────────────────────────────────────
@app.get("/api/audit")
async def api_audit(user: dict = Depends(current_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT action,resource,detail,ts FROM audit_events WHERE user_id=? ORDER BY id DESC LIMIT 50",
                            (user["id"],)).fetchall()
    return {"events": [dict(r) for r in rows]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=18685)
