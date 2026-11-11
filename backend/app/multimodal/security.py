"""Security layer for multimodal ingestion: magic bytes, malware filtering, encryption at rest, signed URLs, and SSRF protection."""
from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
from io import BytesIO
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import time
from typing import Any
from urllib.parse import urlparse
from zipfile import BadZipFile, ZipFile

from cryptography.fernet import Fernet, InvalidToken
import defusedxml.ElementTree as DefusedET

from backend.app.db import ROOT
from backend.app.ingestion.connectors import SECRET_KEY_PATTERN
from backend.app.ingestion.parsers import (
    FileTooLargeError,
    IngestionValidationError,
    XLS_MAGIC,
    XLSX_MAGIC,
    XXE_PATTERN,
    safe_filename,
)

MODALITY_BY_EXT: dict[str, str] = {
    "csv": "structured",
    "xlsx": "structured",
    "xls": "structured",
    "json": "structured",
    "xml": "structured",
    "pdf": "document",
    "docx": "document",
    "pptx": "document",
    "txt": "document",
    "jpg": "image",
    "jpeg": "image",
    "png": "image",
    "webp": "image",
    "mp4": "video",
    "mov": "video",
    "avi": "video",
    "mp3": "audio",
    "wav": "audio",
    "m4a": "audio",
}

MIME_BY_EXT: dict[str, str] = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "json": "application/json",
    "xml": "application/xml",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "txt": "text/plain",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "avi": "video/x-msvideo",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
}

SUPPORTED_MULTIMODAL_EXTENSIONS = set(MODALITY_BY_EXT.keys())

EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
ELF_MAGIC = b"\x7fELF"
PE_MAGIC = b"MZ"
MACHO_MAGICS = (b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe")
SCRIPT_TAG_PATTERN = re.compile(rb"<\s*script\b|javascript:", re.I)

MAX_OOXML_UNCOMPRESSED = 150 * 1024 * 1024


@dataclass(frozen=True)
class FileSecurityResult:
    clean_name: str
    ext: str
    modality: str
    mime_type: str
    size_bytes: int
    sha256: str


def max_bytes_for_modality(modality: str) -> int:
    default_file = int(os.getenv("INGESTION_MAX_FILE_BYTES", 50 * 1024 * 1024))
    if modality == "video":
        return int(os.getenv("INGESTION_MAX_VIDEO_BYTES", max(default_file, 150 * 1024 * 1024)))
    if modality == "audio":
        return int(os.getenv("INGESTION_MAX_AUDIO_BYTES", max(default_file, 100 * 1024 * 1024)))
    return default_file


def _inspect_ooxml_zip(blob: bytes, expected_dir: str, ext: str) -> None:
    if not blob.startswith(XLSX_MAGIC):
        raise IngestionValidationError(f"Invalid .{ext} file signature: expected OOXML ZIP archive.")
    try:
        with ZipFile(BytesIO(blob)) as zf:
            infos = zf.infolist()
            if not infos:
                raise IngestionValidationError(f"Invalid .{ext} archive: package is empty.")
            seen_names: set[str] = set()
            total_uncompressed = 0
            has_expected = False
            for info in infos:
                name = info.filename
                if name.startswith("/") or ".." in Path(name).parts or "\\" in name:
                    raise IngestionValidationError(f"Unsafe archive entry path detected in .{ext} file.")
                if name in seen_names:
                    raise IngestionValidationError(f"Duplicate ZIP entry detected in .{ext} archive.")
                seen_names.add(name)
                total_uncompressed += max(0, info.file_size)
                if total_uncompressed > MAX_OOXML_UNCOMPRESSED:
                    raise FileTooLargeError(f"Uncompressed .{ext} content exceeds safety limit.")
                if name.startswith(expected_dir):
                    has_expected = True
                if name.lower().endswith(".xml") and info.file_size <= 8 * 1024 * 1024:
                    head = zf.read(name)[:8192]
                    if XXE_PATTERN.search(head):
                        raise IngestionValidationError(f"Unsafe XML DOCTYPE/ENTITY directive detected inside .{ext} archive.")
            if not has_expected and "[Content_Types].xml" not in seen_names:
                raise IngestionValidationError(f"File does not appear to be a valid .{ext} document.")
    except (BadZipFile, OSError) as exc:
        raise IngestionValidationError(f"Corrupted .{ext} OOXML archive.") from exc


def _check_malware_and_executables(blob: bytes, ext: str) -> None:
    head = blob[:4096]
    if EICAR_SIGNATURE in blob[:65536]:
        raise IngestionValidationError("Security scan blocked payload matching EICAR antivirus test signature.")
    if head.startswith(PE_MAGIC) or head.startswith(ELF_MAGIC) or any(head.startswith(m) for m in MACHO_MAGICS):
        raise IngestionValidationError("Security scan rejected executable binary payload.")
    if head.startswith(b"#!") and ext not in {"csv", "txt"}:
        raise IngestionValidationError("Security scan rejected executable shell script payload.")
    if ext in {"csv", "json", "xml", "txt"} and SCRIPT_TAG_PATTERN.search(blob[:65536]):
        raise IngestionValidationError("Security scan blocked embedded <script> or active JavaScript payload.")


def inspect_and_validate_file(
    blob: bytes,
    filename: str,
    declared_mime: str | None = None,
) -> FileSecurityResult:
    """Perform extension allowlist, size limit, executable/malware check, and strict magic-byte validation."""
    clean_name = safe_filename(filename)
    ext = Path(clean_name).suffix.lower().lstrip(".")
    if ext not in SUPPORTED_MULTIMODAL_EXTENSIONS:
        raise IngestionValidationError(
            f"Unsupported file format '.{ext or 'unknown'}'. Supported formats include CSV, XLSX, XLS, JSON, XML, PDF, DOCX, PPTX, TXT, JPG, JPEG, PNG, WEBP, MP4, MOV, AVI, MP3, WAV, M4A."
        )
    modality = MODALITY_BY_EXT[ext]
    if len(blob) == 0:
        raise IngestionValidationError(f"Uploaded file '{clean_name}' is empty (0 bytes).")
    max_bytes = max_bytes_for_modality(modality)
    if len(blob) > max_bytes:
        limit_mb = max(1, max_bytes // (1024 * 1024))
        raise FileTooLargeError(f"File '{clean_name}' exceeds maximum allowed size ({limit_mb} MiB for {modality}).")

    _check_malware_and_executables(blob, ext)

    # Strict format-specific magic-byte verification
    if ext == "xlsx":
        _inspect_ooxml_zip(blob, "xl/", ext)
    elif ext == "docx":
        _inspect_ooxml_zip(blob, "word/", ext)
    elif ext == "pptx":
        _inspect_ooxml_zip(blob, "ppt/", ext)
    elif ext == "xls":
        if not blob.startswith(XLS_MAGIC):
            raise IngestionValidationError("Invalid .xls file signature: expected BIFF/CFBF binary header.")
    elif ext == "pdf":
        idx = blob[:1024].find(b"%PDF-")
        if idx < 0:
            raise IngestionValidationError("Invalid .pdf file signature: missing %PDF- header.")
    elif ext in {"jpg", "jpeg"}:
        if not blob.startswith(b"\xff\xd8\xff"):
            raise IngestionValidationError(f"Invalid .{ext} signature: expected JPEG SOI marker (FF D8 FF).")
    elif ext == "png":
        if not blob.startswith(b"\x89PNG\r\n\x1a\n"):
            raise IngestionValidationError("Invalid .png signature: expected PNG magic header.")
    elif ext == "webp":
        if len(blob) < 12 or blob[:4] != b"RIFF" or blob[8:12] != b"WEBP":
            raise IngestionValidationError("Invalid .webp signature: expected RIFF....WEBP header.")
    elif ext == "wav":
        if len(blob) < 12 or blob[:4] != b"RIFF" or blob[8:12] != b"WAVE":
            raise IngestionValidationError("Invalid .wav signature: expected RIFF....WAVE header.")
    elif ext == "avi":
        if len(blob) < 12 or blob[:4] != b"RIFF" or blob[8:12] != b"AVI ":
            raise IngestionValidationError("Invalid .avi signature: expected RIFF....AVI header.")
    elif ext in {"mp4", "mov", "m4a"}:
        # ISO Base Media / QuickTime box signatures typically place 'ftyp' / 'moov' / 'wide' / 'free' at bytes 4..8
        if len(blob) < 12 or blob[4:8] not in {b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip"}:
            raise IngestionValidationError(f"Invalid .{ext} signature: expected ISO BMFF/QuickTime container atom.")
    elif ext == "mp3":
        has_id3 = blob.startswith(b"ID3")
        has_sync = len(blob) >= 2 and blob[0] == 0xFF and (blob[1] & 0xE0) == 0xE0
        if not (has_id3 or has_sync):
            raise IngestionValidationError("Invalid .mp3 signature: expected ID3 tag or MPEG frame sync.")
    elif ext == "xml":
        if b"\x00\x00" in blob[:4096] and not (blob.startswith(b"\xff\xfe") or blob.startswith(b"\xfe\xff")):
            raise IngestionValidationError("Invalid .xml file: unexpected binary nulls.")
        if XXE_PATTERN.search(blob[:16384]):
            raise IngestionValidationError("Unsafe XML directive (DOCTYPE/ENTITY) rejected.")
        try:
            DefusedET.fromstring(blob.decode("utf-8-sig", errors="replace").encode("utf-8"))
        except Exception as exc:
            raise IngestionValidationError(f"Malformed XML syntax: {type(exc).__name__}") from exc
    elif ext in {"csv", "json", "txt"}:
        if b"\x00\x00" in blob[:8192] and not (blob.startswith(b"\xff\xfe") or blob.startswith(b"\xfe\xff")):
            raise IngestionValidationError(f"Invalid .{ext} file: binary null bytes detected.")

    sha256 = hashlib.sha256(blob).hexdigest()
    mime_type = MIME_BY_EXT[ext]
    return FileSecurityResult(
        clean_name=clean_name,
        ext=ext,
        modality=modality,
        mime_type=mime_type,
        size_bytes=len(blob),
        sha256=sha256,
    )


def _resolve_fernet_key() -> bytes:
    env_key = os.getenv("INGESTION_ENCRYPTION_KEY", "").strip()
    if env_key:
        try:
            raw = env_key.encode("utf-8")
            Fernet(raw)
            return raw
        except Exception:
            digest = hashlib.sha256(env_key.encode("utf-8")).digest()
            return base64.urlsafe_b64encode(digest)

    storage_dir = Path(os.getenv("INGESTION_STORAGE_DIR", ROOT / "data" / "storage"))
    storage_dir.mkdir(parents=True, exist_ok=True)
    key_file = storage_dir / ".connector_fernet.key"
    if key_file.is_file():
        candidate = key_file.read_bytes().strip()
        try:
            Fernet(candidate)
            return candidate
        except Exception:
            pass
    generated = Fernet.generate_key()
    tmp = key_file.with_suffix(".tmp")
    tmp.write_bytes(generated)
    os.replace(tmp, key_file)
    return generated


def encrypt_secrets(secrets: dict[str, Any] | None) -> str | None:
    if not secrets:
        return None
    clean = {str(k): v for k, v in secrets.items() if v is not None and str(v) != ""}
    if not clean:
        return None
    f = Fernet(_resolve_fernet_key())
    payload = json.dumps(clean, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return f.encrypt(payload).decode("ascii")


def decrypt_secrets(ciphertext: str | None) -> dict[str, Any]:
    if not ciphertext:
        return {}
    f = Fernet(_resolve_fernet_key())
    try:
        raw = f.decrypt(ciphertext.encode("ascii"))
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except (InvalidToken, ValueError, TypeError):
        return {}


def extract_secret_fields(config: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(config, dict):
        return {}
    out: dict[str, Any] = {}
    for k, v in config.items():
        if SECRET_KEY_PATTERN.search(str(k)) and v not in (None, "", "***redacted***"):
            out[str(k)] = v
    return out


def _signing_key() -> bytes:
    env_sig = os.getenv("INGESTION_SIGNING_SECRET", "").strip()
    if env_sig:
        return env_sig.encode("utf-8")
    return _resolve_fernet_key()


def sign_file_token(
    *,
    company_id: str,
    file_id: str,
    subkey: str = "raw",
    ttl_seconds: int = 900,
) -> tuple[str, int]:
    exp = int(time.time()) + max(30, min(ttl_seconds, 86400))
    msg = f"{company_id}:{file_id}:{subkey}:{exp}".encode("utf-8")
    sig = hmac.new(_signing_key(), msg, hashlib.sha256).hexdigest()
    return f"{exp}.{sig}", exp


def verify_file_token(
    token: str,
    *,
    company_id: str,
    file_id: str,
    subkey: str = "raw",
) -> bool:
    if not token or "." not in token:
        return False
    exp_str, _, supplied_sig = token.partition(".")
    try:
        exp = int(exp_str)
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    msg = f"{company_id}:{file_id}:{subkey}:{exp}".encode("utf-8")
    expected_sig = hmac.new(_signing_key(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(supplied_sig, expected_sig)


def validate_outbound_url(url: str) -> str:
    """Validate HTTP(S) outbound connector URL with SSRF protection."""
    clean = (url or "").strip()
    parsed = urlparse(clean)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise IngestionValidationError("Connector URL must be a valid http:// or https:// endpoint.")
    host = parsed.hostname.lower().strip(".")
    if host in {"metadata.google.internal", "169.254.169.254"}:
        raise IngestionValidationError("Blocked access to cloud metadata host.")
    allow_private = os.getenv("CONNECTOR_ALLOW_PRIVATE_NETWORK", "false").lower() == "true"

    def _check_ip(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
        if ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_unspecified:
            raise IngestionValidationError(f"Blocked unsafe outbound IP address ({ip_obj}).")
        if not allow_private and (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved):
            raise IngestionValidationError(
                f"Blocked private/loopback network target ({ip_obj}). Set CONNECTOR_ALLOW_PRIVATE_NETWORK=true only in trusted environments."
            )

    try:
        ip_literal = ipaddress.ip_address(host)
        _check_ip(ip_literal)
        return clean
    except ValueError:
        pass

    if not allow_private and host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        raise IngestionValidationError("Blocked loopback connector endpoint.")

    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
        for info in infos:
            addr = info[4][0]
            try:
                _check_ip(ipaddress.ip_address(addr.split("%")[0]))
            except ValueError:
                continue
    except OSError:
        # Host may be unreachable in offline environments; allow DNS-unresolvable validation to pass cleanly unless literal private IP
        if not allow_private and host.endswith((".local", ".internal")):
            pass
    return clean

