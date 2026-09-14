#!/usr/bin/env python3
"""v3.0 API test: auth, isolation, folders, tasks, audit."""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:18685"
PW_DEMO = "demo" + "pass123"
PW_NV = "nv" + "123456"
WRONG = "wrong" + "password-xyz"
fail = 0


def call(method, path, token=None, body=None, expect=200, label=""):
    global fail
    req = urllib.request.Request(BASE + path, method=method,
                                 headers={"Content-Type": "application/json",
                                          **({"X-Auth-Token": token} if token else {})},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            code, data = r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        code, data = e.code, json.loads(e.read() or b'null')
    ok = code == expect
    if not ok:
        fail += 1
    print(f"{'PASS' if ok else 'FAIL'} | {label or path} -> {code} "
          f"{json.dumps(data, ensure_ascii=False)[:110]}")
    return data


d = call("POST", "/api/auth/login", body={"email": "demo@fpt.com", "password": PW_DEMO}, label="login demo")
T1 = d.get("token", "")
call("POST", "/api/auth/login", body={"email": "demo@fpt.com", "password": WRONG},
     expect=401, label="wrong pw rejected")
d = call("POST", "/api/auth/login", body={"email": "nhanvien@fpt.com", "password": PW_NV}, label="login nv")
T2 = d.get("token", "")

call("GET", "/api/emails", None, expect=401, label="no token -> 401")

emails = call("GET", "/api/emails?folder=inbox&conversation=true", T1, label="demo inbox")
call("GET", "/api/folders", T1, label="demo folder tree")
call("GET", "/api/emails?folder=all", T2, label="nv all (isolated)")
call("GET", "/api/stats", T1, label="demo stats")

first_id = emails["emails"][0]["email"]["id"]
call("GET", f"/api/emails/{first_id}", T1, label="detail + attachments")
call("POST", f"/api/emails/{first_id}/archive", T1, label="archive")
call("POST", f"/api/emails/{first_id}/task", T1, label="email->task")
call("GET", "/api/tasks", T1, label="tasks")
call("POST", "/api/folders", T1, {"name": "Test Folder", "parent_type": "inbox"}, label="create folder")
call("GET", "/api/search?q=invoice", T1, label="global search")
call("GET", "/api/events", T1, label="calendar events")
call("GET", "/api/contacts", T1, label="contacts")
call("PUT", f"/api/emails/{first_id}/categories", T1, {"categories": ["Work"]}, label="categories")
call("GET", "/api/audit", T1, label="audit trail")
call("GET", f"/api/emails/{first_id}", T2, expect=404, label="nv CANNOT read demo email")
call("POST", "/api/compose", T1, {"to": "boss@fpt.com", "subject": "Bao cao", "body": "Day nhe", "send": True},
     label="compose+send")

print("\nFAILS:", fail)
exit(1 if fail else 0)
