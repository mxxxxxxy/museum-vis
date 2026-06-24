#!/usr/bin/env python3
import cgi
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sys
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


APP_ROOT = Path(__file__).resolve().parents[1]
PORT = int(os.environ.get("PORT", "8787"))
DATA_DIR = Path(os.environ.get("MUSEUM_VIZ_DATA_DIR", APP_ROOT / "data")).resolve()
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
API_PREFIX = "/exhibition_api"
UPLOADS_PREFIX = "/exhibition_uploads"

SUBMISSIONS_ROOT = DATA_DIR / "submissions"
UPLOADS_ROOT = DATA_DIR / "uploads"

MIME_BY_EXT = {
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
}

EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def ensure_dirs():
    SUBMISSIONS_ROOT.mkdir(parents=True, exist_ok=True)
    UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)


def normalize_user_name(value):
    return str(value or "").strip()[:80]


def user_key_for(user_name):
    digest = hashlib.sha256(normalize_user_name(user_name).encode("utf-8")).hexdigest()[:12]
    return "user_" + digest


def draft_id_for_user(user_name):
    return user_key_for(user_name)


def clean_asset_id(value):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(value or "").strip())[:80]


def clean_optional_id(value):
    text = str(value or "").strip()
    return text[:120] if text else None


def clean_role(value):
    return value if value in ("environment", "photo", "audio") else "photo"


def submission_dir(user_name):
    return SUBMISSIONS_ROOT / user_key_for(user_name)


def safe_join(root, relative):
    root_path = Path(root).resolve()
    target = (root_path / relative).resolve()
    try:
        target.relative_to(root_path)
    except ValueError:
        return None
    return target


def normalize_stored_draft(input_draft, user_name):
    draft = dict(input_draft or {})
    info = dict(draft.get("info") or {})
    info["submitterName"] = user_name
    draft["id"] = draft_id_for_user(user_name)
    draft["info"] = info
    draft["units"] = draft.get("units") if isinstance(draft.get("units"), list) else []
    draft["createdAt"] = draft.get("createdAt") or now_iso()
    draft["updatedAt"] = draft.get("updatedAt") or draft["createdAt"]
    return draft


def prepare_draft(input_draft, user_name):
    draft = normalize_stored_draft(input_draft, user_name)
    draft["updatedAt"] = now_iso()
    draft["status"] = draft.get("status") or "draft"
    return draft


def read_draft_file(path, user_name):
    try:
        with path.open("r", encoding="utf-8") as file:
            return normalize_stored_draft(json.load(file), user_name)
    except Exception:
        return None


def read_legacy_draft(user_name):
    root = SUBMISSIONS_ROOT / user_key_for(user_name)
    if not root.exists():
        return None
    drafts = []
    for child in root.iterdir():
        if child.is_dir():
            draft = read_draft_file(child / "draft.json", user_name)
            if draft:
                drafts.append(draft)
    drafts.sort(key=lambda draft: str(draft.get("updatedAt") or ""), reverse=True)
    return drafts[0] if drafts else None


def read_draft(user_name):
    draft = read_draft_file(submission_dir(user_name) / "draft.json", user_name)
    return draft or read_legacy_draft(user_name)


def write_draft(user_name, draft):
    directory = submission_dir(user_name)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "draft.json").open("w", encoding="utf-8") as file:
        json.dump(draft, file, ensure_ascii=False, indent=2)
        file.write("\n")


def find_current_draft(user_name):
    return read_draft(user_name)


def is_allowed_upload_type(mime_type):
    return isinstance(mime_type, str) and (mime_type.startswith("image/") or mime_type.startswith("audio/"))


def extension_for(mime_type, original_name):
    if mime_type in EXT_BY_MIME:
        return EXT_BY_MIME[mime_type]
    ext = Path(original_name or "").suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]{1,8}", ext):
        return ext
    return ".bin"


class MuseumVizHandler(BaseHTTPRequestHandler):
    server_version = "MuseumVizPython/1.0"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        self.route(head_only=False)

    def do_HEAD(self):
        self.route(head_only=True)

    def do_POST(self):
        self.route(head_only=False)

    def do_PUT(self):
        self.route(head_only=False)

    def do_DELETE(self):
        self.route(head_only=False)

    def route(self, head_only=False):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        try:
            if self.command == "GET" and path == API_PREFIX + "/health":
                return self.send_json(200, {"ok": True, "dataDir": str(DATA_DIR)})

            if self.command == "POST" and path == API_PREFIX + "/session":
                body = self.read_json()
                user_name = normalize_user_name(body.get("userName") or (body.get("draft") or {}).get("info", {}).get("submitterName"))
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                existing = find_current_draft(user_name)
                if existing:
                    write_draft(user_name, existing)
                    return self.send_json(200, {"draft": existing, "userName": user_name, "userKey": user_key_for(user_name)})
                draft = prepare_draft(body.get("draft") or {}, user_name)
                write_draft(user_name, draft)
                return self.send_json(201, {"draft": draft, "userName": user_name, "userKey": user_key_for(user_name)})

            if self.command == "GET" and path == API_PREFIX + "/submissions/current":
                user_name = normalize_user_name((query.get("userName") or [""])[0])
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                return self.send_json(200, {"draft": find_current_draft(user_name), "userName": user_name, "userKey": user_key_for(user_name)})

            if self.command == "PUT" and path == API_PREFIX + "/draft":
                body = self.read_json()
                user_name = normalize_user_name(body.get("userName") or (body.get("draft") or {}).get("info", {}).get("submitterName"))
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                draft = prepare_draft(body.get("draft") or {}, user_name)
                write_draft(user_name, draft)
                return self.send_json(200, {"draft": draft, "userName": user_name, "userKey": user_key_for(user_name)})

            if self.command == "POST" and path == API_PREFIX + "/assets":
                return self.handle_upload()

            match = re.fullmatch(re.escape(API_PREFIX) + r"/assets/([^/]+)", path)
            if match and self.command == "DELETE":
                asset_id = clean_asset_id(match.group(1))
                body = self.read_json(optional=True)
                user_name = normalize_user_name(body.get("userName") or (query.get("userName") or [""])[0])
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                self.remove_asset_file(body.get("url"))
                return self.send_json(200, {"ok": True})

            if self.command == "POST" and path == API_PREFIX + "/submit":
                body = self.read_json()
                user_name = normalize_user_name(body.get("userName") or (body.get("draft") or {}).get("info", {}).get("submitterName"))
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                draft = prepare_draft({**(body.get("draft") or {}), "status": "submitted", "submittedAt": now_iso()}, user_name)
                write_draft(user_name, draft)
                return self.send_json(200, {"draft": draft, "userName": user_name, "userKey": user_key_for(user_name)})

            if self.command == "GET" and path == API_PREFIX + "/export":
                user_name = normalize_user_name((query.get("userName") or [""])[0])
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                draft = read_draft(user_name)
                if not draft:
                    return self.send_json(404, {"error": "NOT_FOUND"})
                return self.send_json(200, draft)

            match = re.fullmatch(re.escape(API_PREFIX) + r"/submissions/([^/]+)", path)
            if match and self.command == "PUT":
                body = self.read_json()
                user_name = normalize_user_name(body.get("userName") or (body.get("draft") or {}).get("info", {}).get("submitterName"))
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                draft = prepare_draft(body.get("draft") or {}, user_name)
                write_draft(user_name, draft)
                return self.send_json(200, {"draft": draft, "userName": user_name, "userKey": user_key_for(user_name)})

            match = re.fullmatch(re.escape(API_PREFIX) + r"/submissions/([^/]+)/assets", path)
            if match and self.command == "POST":
                return self.handle_upload()

            match = re.fullmatch(re.escape(API_PREFIX) + r"/submissions/([^/]+)/assets/([^/]+)", path)
            if match and self.command == "DELETE":
                asset_id = clean_asset_id(match.group(2))
                body = self.read_json(optional=True)
                user_name = normalize_user_name(body.get("userName") or (query.get("userName") or [""])[0])
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                self.remove_asset_file(body.get("url"))
                return self.send_json(200, {"ok": True})

            match = re.fullmatch(re.escape(API_PREFIX) + r"/submissions/([^/]+)/submit", path)
            if match and self.command == "POST":
                body = self.read_json()
                user_name = normalize_user_name(body.get("userName") or (body.get("draft") or {}).get("info", {}).get("submitterName"))
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                draft = prepare_draft({**(body.get("draft") or {}), "status": "submitted", "submittedAt": now_iso()}, user_name)
                write_draft(user_name, draft)
                return self.send_json(200, {"draft": draft, "userName": user_name, "userKey": user_key_for(user_name)})

            match = re.fullmatch(re.escape(API_PREFIX) + r"/submissions/([^/]+)/export", path)
            if match and self.command == "GET":
                user_name = normalize_user_name((query.get("userName") or [""])[0])
                if not user_name:
                    return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
                draft = read_draft(user_name)
                if not draft:
                    return self.send_json(404, {"error": "NOT_FOUND"})
                return self.send_json(200, draft)

            if path.startswith(UPLOADS_PREFIX + "/") and self.command in ("GET", "HEAD"):
                relative = unquote(path[len(UPLOADS_PREFIX) + 1 :])
                return self.serve_upload(relative, head_only=head_only)

            return self.send_json(404, {"error": "NOT_FOUND"})
        except Exception as error:
            print(error, file=sys.stderr)
            return self.send_json(500, {"error": "SERVER_ERROR", "message": "服务器内部错误"})

    def read_json(self, optional=False):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {} if optional else {}
        raw = self.rfile.read(length).decode("utf-8").strip()
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def read_multipart(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("FILE_TOO_LARGE")
        return cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": str(length),
            },
        )

    def handle_upload(self):
        try:
            form = self.read_multipart()
        except ValueError:
            return self.send_json(413, {"error": "FILE_TOO_LARGE", "maxBytes": MAX_UPLOAD_BYTES})

        user_name = normalize_user_name(form.getfirst("userName", ""))
        role = clean_role(form.getfirst("role", "photo"))
        label = form.getfirst("label", role)
        unit_id = clean_optional_id(form.getfirst("unitId", ""))
        item_id = clean_optional_id(form.getfirst("itemId", ""))
        file_item = form["file"] if "file" in form else None
        if isinstance(file_item, list):
            file_item = file_item[0]

        if not user_name:
            return self.send_json(400, {"error": "USER_NAME_REQUIRED"})
        if file_item is None or not getattr(file_item, "file", None):
            return self.send_json(400, {"error": "FILE_REQUIRED"})

        mime_type = file_item.type or mimetypes.guess_type(file_item.filename or "")[0] or ""
        if not is_allowed_upload_type(mime_type):
            return self.send_json(415, {"error": "UNSUPPORTED_MEDIA_TYPE", "type": mime_type})

        asset_id = str(uuid.uuid4())
        extension = extension_for(mime_type, file_item.filename)
        file_name = asset_id + extension
        user_key = user_key_for(user_name)
        role_folder = "environment" if role == "environment" else "audio" if role == "audio" else "photos"
        asset_dir = UPLOADS_ROOT / user_key / role_folder
        asset_dir.mkdir(parents=True, exist_ok=True)
        final_path = asset_dir / file_name

        size = 0
        with final_path.open("wb") as output:
            while True:
                chunk = file_item.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    output.close()
                    try:
                        final_path.unlink()
                    except FileNotFoundError:
                        pass
                    return self.send_json(413, {"error": "FILE_TOO_LARGE", "maxBytes": MAX_UPLOAD_BYTES})
                output.write(chunk)

        asset = {
            "id": asset_id,
            "role": role,
            "label": label,
            "name": file_name,
            "originalName": file_item.filename or file_name,
            "type": mime_type,
            "size": size,
            "url": f"{UPLOADS_PREFIX}/{user_key}/{role_folder}/{file_name}",
            "createdAt": now_iso(),
            "unitId": unit_id,
            "itemId": item_id,
        }
        return self.send_json(201, {"asset": asset, "userName": user_name, "userKey": user_key})

    def remove_asset_file(self, url):
        if not isinstance(url, str) or not url.startswith(UPLOADS_PREFIX + "/"):
            return
        relative = unquote(url[len(UPLOADS_PREFIX) + 1 :])
        target = safe_join(UPLOADS_ROOT, relative)
        if target and target.is_file():
            try:
                target.unlink()
            except FileNotFoundError:
                pass

    def serve_upload(self, relative, head_only=False):
        target = safe_join(UPLOADS_ROOT, relative)
        if not target or not target.is_file():
            return self.send_json(404, {"error": "NOT_FOUND"})
        mime_type = MIME_BY_EXT.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        if not head_only:
            with target.open("rb") as file:
                shutil.copyfileobj(file, self.wfile)

    def send_json(self, status, payload):
        body = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))


def main():
    ensure_dirs()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MuseumVizHandler)
    print(f"Museum Viz Python server listening on http://0.0.0.0:{PORT}")
    print(f"Data directory: {DATA_DIR}")
    server.serve_forever()


if __name__ == "__main__":
    main()
