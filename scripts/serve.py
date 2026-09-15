"""Serve built frontend (dist/) and proxy /api to backend - single port."""
import http.server
import socketserver
import urllib.request
import urllib.error
import os
import json
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
DIST = os.path.expanduser("~/tamvk/mail-app/frontend/dist")
BACKEND = os.environ.get("MM_API_TARGET", "http://127.0.0.1:18685")


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def _stream_proxy(self):
        """Pass-through for SSE (/api/events): chunked, flushed per line."""
        req = urllib.request.Request(BACKEND + self.path,
                                     headers={"Accept": "text/event-stream"})
        try:
            resp = urllib.request.urlopen(req, timeout=180)
        except Exception as e:
            payload = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Accel-Buffering", "no")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
        except Exception as e:
            print(f"[sse] header write failed: {e!r}", file=sys.stderr, flush=True)
            return
        try:
            for line in resp:                      # yields as SSE frames arrive
                chunk = b"%x\r\n%s\r\n" % (len(line), line)
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception as e:
            print(f"[sse] stream ended: {e!r}", file=sys.stderr, flush=True)
        finally:
            try:
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except Exception:
                pass

    def _proxy(self, method):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else None
        fwd = {"Content-Type": self.headers.get("Content-Type", "application/json")}
        for h in ("X-Auth-Token", "Authorization", "Accept"):
            v = self.headers.get(h)
            if v:
                fwd[h] = v
        req = urllib.request.Request(BACKEND + self.path, data=body, method=method, headers=fwd)
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                payload = res.read()
                self.send_response(res.status)
                self.send_header("Content-Type", res.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            payload = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            payload = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        if self.path.startswith("/api/realtime/stream"):
            self._stream_proxy()
        elif self.path.startswith("/api"):
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        self._proxy("POST") if self.path.startswith("/api") else self.send_error(405)

    def do_PUT(self):
        self._proxy("PUT") if self.path.startswith("/api") else self.send_error(405)

    def do_DELETE(self):
        self._proxy("DELETE") if self.path.startswith("/api") else self.send_error(405)

    def log_message(self, fmt, *args):
        pass  # quiet


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving {DIST} on :{PORT}, /api -> {BACKEND}", flush=True)
        httpd.serve_forever()
