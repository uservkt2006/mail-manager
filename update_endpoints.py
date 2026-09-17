
# ─── auto-update ──────────────────────────────────────────────────────────
def _github_release(client_version="3.4.0"):
    """Check GitHub releases for newer version. Returns dict with update info."""
    import urllib.request
    import json as _json
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/vokhactam/mail-manager/releases/latest",
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
    return _github_release("3.4.0")


@app.get("/api/update/download")
async def api_update_download():
    """Download the latest update file."""
    info = _github_release("3.4.0")
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

