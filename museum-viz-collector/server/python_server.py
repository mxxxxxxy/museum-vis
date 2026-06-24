#!/usr/bin/env python3
import base64
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
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


def _load_env_file():
    """从 server/.env 读取环境变量（每行 KEY=VALUE），方便本地和服务器配置密钥。
    已经存在的真实环境变量优先，不会被文件覆盖。"""
    env_path = Path(os.environ.get("MUSEUM_VIZ_ENV_FILE", APP_ROOT / "server" / ".env"))
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

# 腾讯云语音识别（一句话识别 SentenceRecognition）。密钥从环境变量读取，不写进代码。
TENCENT_SECRET_ID = os.environ.get("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = os.environ.get("TENCENT_SECRET_KEY", "")
TENCENT_ASR_REGION = os.environ.get("TENCENT_ASR_REGION", "ap-guangzhou")
TENCENT_ASR_ENGINE = os.environ.get("TENCENT_ASR_ENGINE", "16k_zh")
TENCENT_ASR_HOST = "asr.tencentcloudapi.com"

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
    return value if value in ("environment", "floorplan", "photo", "audio") else "photo"


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


def convert_audio_to_wav(ffmpeg, audio_bytes, src_ext):
    """ffmpeg 已确认存在；把录音转成 16k 单声道 wav。转码失败返回 None。"""
    suffix = src_ext if re.fullmatch(r"\.[a-z0-9]{1,8}", src_ext or "") else ".bin"
    src_path = None
    dst_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as src_file:
            src_file.write(audio_bytes)
            src_path = src_file.name
        dst_path = src_path + ".wav"
        subprocess.run(
            [ffmpeg, "-y", "-i", src_path, "-ar", "16000", "-ac", "1", "-f", "wav", dst_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60,
        )
        with open(dst_path, "rb") as out_file:
            return out_file.read()
    except Exception as error:
        print("ffmpeg convert failed:", error, file=sys.stderr)
        return None
    finally:
        for path in (src_path, dst_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass


# 这几个错误码表示"免费额度/资源包用尽"，触发自动切换到录音文件识别（它有独立免费额度）。
ASR_FALLBACK_CODES = {
    "FailedOperation.UserHasNoFreeAmount",  # 本月免费额度用完（一句话识别 5000 次用完就是它）
    "FailedOperation.UserHasNoAmount",      # 资源包耗尽
}


class TencentAsrError(Exception):
    def __init__(self, code, message):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def tencent_api_request(action, payload_obj):
    """通用 TC3-HMAC-SHA256 签名 + 调用腾讯云 asr 接口，返回 Response 字段。
    出错抛 TencentAsrError（带错误码）。仅依赖标准库。"""
    version = "2019-06-14"
    service = "asr"
    algorithm = "TC3-HMAC-SHA256"
    content_type = "application/json; charset=utf-8"
    timestamp = int(time.time())
    date = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d")
    payload = json.dumps(payload_obj, ensure_ascii=False, separators=(",", ":"))

    canonical_headers = f"content-type:{content_type}\nhost:{TENCENT_ASR_HOST}\n"
    signed_headers = "content-type;host"
    hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = "\n".join(["POST", "/", "", canonical_headers, signed_headers, hashed_payload])

    credential_scope = f"{date}/{service}/tc3_request"
    string_to_sign = "\n".join([
        algorithm,
        str(timestamp),
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])

    def sign(key, msg):
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    secret_date = sign(("TC3" + TENCENT_SECRET_KEY).encode("utf-8"), date)
    secret_service = sign(secret_date, service)
    secret_signing = sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"{algorithm} Credential={TENCENT_SECRET_ID}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    request = urllib.request.Request(
        f"https://{TENCENT_ASR_HOST}/",
        data=payload.encode("utf-8"),
        method="POST",
        headers={
            "Authorization": authorization,
            "Content-Type": content_type,
            "Host": TENCENT_ASR_HOST,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": version,
            "X-TC-Region": TENCENT_ASR_REGION,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.loads(response.read().decode("utf-8"))
    result = body.get("Response") or {}
    error = result.get("Error")
    if error:
        raise TencentAsrError(error.get("Code", ""), error.get("Message", ""))
    return result


def tencent_sentence_recognize(audio_bytes):
    """一句话识别（同步，≤60 秒），返回识别文本。"""
    if os.environ.get("TENCENT_ASR_SIMULATE_NO_QUOTA") == "1":
        # 测试/演示用：模拟"5000 次免费额度已用完"，用来验证自动切换。
        raise TencentAsrError("FailedOperation.UserHasNoFreeAmount", "（模拟）账号本月免费额度已用完")
    result = tencent_api_request("SentenceRecognition", {
        "ProjectId": 0,
        "SubServiceType": 2,
        "EngSerViceType": TENCENT_ASR_ENGINE,
        "SourceType": 1,
        "VoiceFormat": "wav",
        "UsrAudioKey": str(uuid.uuid4()),
        "Data": base64.b64encode(audio_bytes).decode("ascii"),
        "DataLen": len(audio_bytes),
    })
    return result.get("Result", "") or ""


def tencent_file_recognize(audio_bytes):
    """录音文件识别（异步：建任务 → 轮询拿结果）。免费额度独立于一句话识别。返回识别文本。"""
    created = tencent_api_request("CreateRecTask", {
        "EngineModelType": TENCENT_ASR_ENGINE,
        "ChannelNum": 1,
        "ResTextFormat": 0,
        "SourceType": 1,
        "Data": base64.b64encode(audio_bytes).decode("ascii"),
        "DataLen": len(audio_bytes),
    })
    task_id = (created.get("Data") or {}).get("TaskId")
    if not task_id:
        raise TencentAsrError("NoTaskId", "录音文件识别未返回 TaskId")
    for _ in range(30):
        time.sleep(1)
        status = tencent_api_request("DescribeTaskStatus", {"TaskId": task_id})
        data = status.get("Data") or {}
        state = data.get("Status")
        if state == 2:  # 成功
            return clean_rec_result(data.get("Result", ""))
        if state == 3:  # 失败
            raise TencentAsrError("RecTaskFailed", data.get("ErrorMsg", "录音文件识别失败"))
    raise TencentAsrError("RecTaskTimeout", "录音文件识别超时")


def clean_rec_result(text):
    """录音文件识别结果每行可能带 [起:止] 时间戳前缀，去掉后拼成纯文本。"""
    lines = []
    for line in (text or "").splitlines():
        cleaned = re.sub(r"^\s*\[[0-9:.,\s]+\]\s*", "", line).strip()
        if cleaned:
            lines.append(cleaned)
    return "".join(lines)


def recognize_audio(audio_bytes):
    """先用一句话识别；若免费额度/资源包用尽，自动切到录音文件识别。返回 (文本, 引擎名)。"""
    try:
        return tencent_sentence_recognize(audio_bytes), "sentence"
    except TencentAsrError as error:
        if error.code in ASR_FALLBACK_CODES:
            print(f"一句话识别额度用尽（{error.code}），自动切换到录音文件识别", file=sys.stderr)
            return tencent_file_recognize(audio_bytes), "file"
        raise


VOICE_SECTION_LABELS = {
    "visualizationSelf": "可视化描述",
    "exhibitionFunction": "可视化在展览中的功能",
    "humanInteraction": "和人的交互形式",
    "evaluation": "你对它的评价",
    "additionalInfo": "其他补充",
}


def save_voice_file(user_name, audio_bytes, mime_type, original_name):
    """把语音输入的原始录音存到 uploads/<user>/audio/，返回 {id, name, url}。"""
    asset_id = str(uuid.uuid4())
    extension = extension_for(mime_type, original_name)
    file_name = asset_id + extension
    user_key = user_key_for(user_name)
    audio_dir = UPLOADS_ROOT / user_key / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    with (audio_dir / file_name).open("wb") as output:
        output.write(audio_bytes)
    return {
        "id": asset_id,
        "name": file_name,
        "url": f"{UPLOADS_PREFIX}/{user_key}/audio/{file_name}",
    }


def append_voice_log(user_name, record):
    """把一条语音录音的元数据按时间先后追加到后台日志（每行一条 JSON）。"""
    user_key = user_key_for(user_name)
    log_dir = SUBMISSIONS_ROOT / user_key
    log_dir.mkdir(parents=True, exist_ok=True)
    with (log_dir / "voice_recordings.jsonl").open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(record, ensure_ascii=False) + "\n")


class MultipartField:
    """模拟 cgi.FieldStorage 单个字段的最小接口（.file/.filename/.type/.value）。"""

    def __init__(self, name, filename, content_type, data):
        self.name = name
        self.filename = filename
        self.type = content_type
        self.value = data
        self.file = io.BytesIO(data) if filename is not None else None


class MultipartForm:
    """模拟 cgi.FieldStorage 的最小接口：getfirst / in / []。"""

    def __init__(self, fields):
        self._fields = fields

    def getfirst(self, name, default=None):
        items = self._fields.get(name)
        if not items:
            return default
        field = items[0]
        if field.filename is None:
            return field.value.decode("utf-8", "replace")
        return field.value

    def __contains__(self, name):
        return name in self._fields

    def __getitem__(self, name):
        items = self._fields.get(name)
        if not items:
            raise KeyError(name)
        return items[0] if len(items) == 1 else items


def parse_multipart(content_type_header, body):
    """用标准库解析 multipart/form-data（替代 3.13 已删除的 cgi 模块）。"""
    match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type_header or "")
    if not match:
        raise ValueError("NO_BOUNDARY")
    boundary = (match.group(1) or match.group(2)).strip()
    delimiter = b"--" + boundary.encode("latin-1")
    fields = {}
    for segment in body.split(delimiter):
        if segment.startswith(b"\r\n"):
            segment = segment[2:]
        if segment.endswith(b"\r\n"):
            segment = segment[:-2]
        if not segment or segment == b"--":
            continue
        header_blob, separator, content = segment.partition(b"\r\n\r\n")
        if not separator:
            continue
        disposition = ""
        field_type = ""
        for line in header_blob.split(b"\r\n"):
            decoded = line.decode("utf-8", "replace")
            lowered = decoded.lower()
            if lowered.startswith("content-disposition:"):
                disposition = decoded
            elif lowered.startswith("content-type:"):
                field_type = decoded.split(":", 1)[1].strip()
        name_match = re.search(r'name="([^"]*)"', disposition)
        if not name_match:
            continue
        filename_match = re.search(r'filename="([^"]*)"', disposition)
        filename = filename_match.group(1) if filename_match else None
        field = MultipartField(name_match.group(1), filename, field_type, content)
        fields.setdefault(field.name, []).append(field)
    return MultipartForm(fields)


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

            if self.command == "POST" and path == API_PREFIX + "/transcribe":
                return self.handle_transcribe()

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
        body = self.rfile.read(length) if length > 0 else b""
        return parse_multipart(self.headers.get("Content-Type", ""), body)

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
        role_folder = (
            "environment"
            if role == "environment"
            else "floorplans"
            if role == "floorplan"
            else "audio"
            if role == "audio"
            else "photos"
        )
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

    def handle_transcribe(self):
        if not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
            return self.send_json(503, {"error": "ASR_NOT_CONFIGURED", "message": "服务器未配置腾讯云语音识别密钥"})
        try:
            form = self.read_multipart()
        except ValueError:
            return self.send_json(413, {"error": "FILE_TOO_LARGE", "maxBytes": MAX_UPLOAD_BYTES})

        file_item = form["file"] if "file" in form else None
        if isinstance(file_item, list):
            file_item = file_item[0]
        if file_item is None or not getattr(file_item, "file", None):
            return self.send_json(400, {"error": "FILE_REQUIRED"})

        audio_bytes = file_item.file.read()
        if not audio_bytes:
            return self.send_json(400, {"error": "FILE_REQUIRED"})

        user_name = normalize_user_name(form.getfirst("userName", ""))
        unit_id = clean_optional_id(form.getfirst("unitId", ""))
        item_id = clean_optional_id(form.getfirst("itemId", ""))
        section = clean_optional_id(form.getfirst("section", ""))
        mime_type = file_item.type or mimetypes.guess_type(file_item.filename or "")[0] or ""

        # 先把原始录音落盘留底（即使后面转写失败，也能以后重转）。只有带用户名才存。
        saved = save_voice_file(user_name, audio_bytes, mime_type, file_item.filename) if user_name else None

        def write_log(text, status, engine=""):
            if saved:
                append_voice_log(user_name, {
                    "id": saved["id"],
                    "file": saved["name"],
                    "url": saved["url"],
                    "createdAt": now_iso(),
                    "unitId": unit_id,
                    "itemId": item_id,
                    "section": section,
                    "sectionLabel": VOICE_SECTION_LABELS.get(section, section),
                    "mimeType": mime_type,
                    "size": len(audio_bytes),
                    "status": status,
                    "engine": engine,
                    "text": text,
                })

        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            write_log("", "ffmpeg_missing")
            return self.send_json(503, {"error": "FFMPEG_MISSING", "message": "服务器未找到 ffmpeg，请在后端所在的 conda 环境里安装"})
        audio_for_asr = convert_audio_to_wav(ffmpeg, audio_bytes, src_ext=extension_for(mime_type, file_item.filename))
        if audio_for_asr is None:
            write_log("", "convert_failed")
            return self.send_json(422, {"error": "AUDIO_CONVERT_FAILED", "message": "录音转码失败，请重试或换个浏览器再录"})

        # 一句话识别要求 base64 后数据较小（约 ≤ 60 秒），这里按原始字节兜个底。
        if len(audio_for_asr) > 3 * 1024 * 1024:
            write_log("", "too_long")
            return self.send_json(413, {"error": "AUDIO_TOO_LONG", "message": "录音太长，请控制在 60 秒以内"})

        try:
            text, engine = recognize_audio(audio_for_asr)
        except Exception as error:
            print("ASR error:", error, file=sys.stderr)
            write_log("", "asr_failed")
            return self.send_json(502, {"error": "ASR_FAILED", "message": "语音识别失败，请重试"})

        # 没识别出内容（用户那边会提示"没听清"）：这条录音没价值，删掉且不记日志。
        if not text.strip():
            if saved:
                self.remove_asset_file(saved["url"])
            return self.send_json(200, {"text": ""})

        write_log(text, "ok", engine)
        return self.send_json(200, {"text": text})

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
