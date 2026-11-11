"""Object storage abstraction separating raw files, cleaned datasets, and quality error reports from RDBMS metadata."""
from __future__ import annotations

from abc import ABC, abstractmethod
from io import BytesIO
import os
from pathlib import Path, PurePosixPath
from typing import BinaryIO
from uuid import uuid4

from backend.app.db import ROOT


DEFAULT_STORAGE_DIR = Path(os.getenv("INGESTION_STORAGE_DIR", ROOT / "data" / "storage"))


class StorageSecurityError(ValueError):
    """Raised when a storage key attempts path traversal or invalid characters."""


def sanitize_key(key: str) -> str:
    if not key or "\x00" in key or "\\" in key.strip():
        raise StorageSecurityError("Invalid storage object key.")
    normalized = key.strip().lstrip("/")
    posix = PurePosixPath(normalized)
    if not posix.parts or any(part in {"", ".", ".."} for part in posix.parts):
        raise StorageSecurityError("Storage key contains invalid path segments.")
    return "/".join(posix.parts)


class ObjectStorage(ABC):
    """Pluggable blob storage contract for raw uploads, cleaned data, and error reports."""

    backend_name: str = "abstract"

    @abstractmethod
    def put_bytes(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        """Persist bytes under key and return the canonical key."""

    @abstractmethod
    def get_bytes(self, key: str) -> bytes:
        """Read full object bytes for key."""

    def open_stream(self, key: str) -> BinaryIO:
        """Return a binary stream over key."""
        return BytesIO(self.get_bytes(key))

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return True if object exists."""

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete single object if present."""

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects matching prefix and return deleted count."""


class LocalObjectStorage(ObjectStorage):
    """Atomic filesystem-backed object store scoped under a workspace base directory."""

    backend_name = "local"

    def __init__(self, base_dir: Path | str | None = None):
        self.base_dir = Path(base_dir or os.getenv("INGESTION_STORAGE_DIR") or DEFAULT_STORAGE_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        clean = sanitize_key(key)
        target = (self.base_dir / clean).resolve()
        try:
            target.relative_to(self.base_dir)
        except ValueError as exc:
            raise StorageSecurityError("Resolved storage path escapes base storage directory.") from exc
        return target

    def put_bytes(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        clean = sanitize_key(key)
        target = self._resolve(clean)
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_path = target.parent / f".{target.name}.{uuid4().hex}.tmp"
        try:
            temp_path.write_bytes(data)
            os.replace(temp_path, target)
        finally:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
        return clean

    def get_bytes(self, key: str) -> bytes:
        target = self._resolve(key)
        if not target.is_file():
            raise FileNotFoundError(f"Stored object not found: {key}")
        return target.read_bytes()

    def exists(self, key: str) -> bool:
        try:
            return self._resolve(key).is_file()
        except StorageSecurityError:
            return False

    def delete(self, key: str) -> bool:
        target = self._resolve(key)
        if target.is_file():
            target.unlink()
            return True
        return False

    def delete_prefix(self, prefix: str) -> int:
        clean = sanitize_key(prefix.rstrip("/"))
        target = self._resolve(clean)
        removed = 0
        if target.is_file():
            target.unlink()
            return 1
        if target.is_dir():
            for path in sorted(target.rglob("*"), reverse=True):
                if path.is_file():
                    path.unlink()
                    removed += 1
                elif path.is_dir():
                    try:
                        path.rmdir()
                    except OSError:
                        pass
            try:
                target.rmdir()
            except OSError:
                pass
        return removed


class S3CompatibleObjectStorage(ObjectStorage):
    """S3 / MinIO compatible storage adapter enabled when INGESTION_STORAGE_BACKEND=s3."""

    backend_name = "s3"

    def __init__(
        self,
        *,
        bucket: str | None = None,
        endpoint_url: str | None = None,
        region_name: str | None = None,
        prefix: str = "",
    ):
        self.bucket = bucket or os.getenv("INGESTION_S3_BUCKET", "")
        self.endpoint_url = endpoint_url or os.getenv("INGESTION_S3_ENDPOINT") or None
        self.region_name = region_name or os.getenv("INGESTION_S3_REGION", "ap-southeast-1")
        self.prefix = prefix.strip("/")
        if not self.bucket:
            raise RuntimeError("INGESTION_S3_BUCKET must be configured when using S3 storage.")

    def _client(self):
        try:
            import boto3  # type: ignore
        except ImportError as exc:
            raise RuntimeError("Install boto3 to enable S3CompatibleObjectStorage.") from exc
        return boto3.client("s3", endpoint_url=self.endpoint_url, region_name=self.region_name)

    def _full_key(self, key: str) -> str:
        clean = sanitize_key(key)
        return f"{self.prefix}/{clean}" if self.prefix else clean

    def put_bytes(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        clean = sanitize_key(key)
        self._client().put_object(Bucket=self.bucket, Key=self._full_key(clean), Body=data, ContentType=content_type)
        return clean

    def get_bytes(self, key: str) -> bytes:
        response = self._client().get_object(Bucket=self.bucket, Key=self._full_key(key))
        return response["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self._client().head_object(Bucket=self.bucket, Key=self._full_key(key))
            return True
        except Exception:
            return False

    def delete(self, key: str) -> bool:
        self._client().delete_object(Bucket=self.bucket, Key=self._full_key(key))
        return True

    def delete_prefix(self, prefix: str) -> int:
        full_prefix = self._full_key(prefix.rstrip("/")) + "/"
        client = self._client()
        listed = client.list_objects_v2(Bucket=self.bucket, Prefix=full_prefix)
        contents = listed.get("Contents", [])
        if not contents:
            return 0
        client.delete_objects(Bucket=self.bucket, Delete={"Objects": [{"Key": item["Key"]} for item in contents]})
        return len(contents)


def get_object_storage() -> ObjectStorage:
    backend = os.getenv("INGESTION_STORAGE_BACKEND", "local").strip().lower()
    if backend == "s3":
        return S3CompatibleObjectStorage()
    return LocalObjectStorage()

