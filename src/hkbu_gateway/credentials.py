import hashlib
import logging
import os
from pathlib import Path
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def resolve_or_generate_key(database_path: str, encryption_key: str | None = None) -> str:
    """Resolve explicit encryption key or auto-generate and persist next to database."""
    if encryption_key:
        return encryption_key

    if database_path == ":memory:":
        logger.info("Using ephemeral encryption key for in-memory database")
        return Fernet.generate_key().decode()

    key_path = Path(database_path).with_suffix(".key")
    if key_path.is_file():
        try:
            stored_key = key_path.read_text(encoding="utf-8").strip()
            # Validate Fernet key format
            Fernet(stored_key.encode())
            return stored_key
        except Exception as exc:
            logger.warning("Existing key file at %s was invalid (%s); generating a new key.", key_path, exc)

    new_key = Fernet.generate_key().decode()
    try:
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key_path.write_text(new_key, encoding="utf-8")
        try:
            os.chmod(key_path, 0o600)
        except OSError:
            pass
        logger.info("HKBU_GATEWAY_ENCRYPTION_KEY not set. Auto-generated encryption key saved to %s", key_path)
    except OSError as exc:
        logger.warning("Could not persist auto-generated encryption key to %s (%s). Using ephemeral key.", key_path, exc)

    return new_key


@dataclass(frozen=True)
class Credential:
    key_id: int
    gateway_key: str
    hkbu_api_key: str


class CredentialStore:
    def __init__(self, database_path: str, encryption_key: str | None = None):
        resolved_key = resolve_or_generate_key(database_path, encryption_key)
        try:
            self.cipher = Fernet(resolved_key.encode())
        except ValueError as exc:
            raise RuntimeError(
                "HKBU_GATEWAY_ENCRYPTION_KEY must be a valid Fernet key"
            ) from exc
        self.database_path = database_path
        self._memory_conn: sqlite3.Connection | None = (
            sqlite3.connect(":memory:") if database_path == ":memory:" else None
        )
        if self._memory_conn:
            self._memory_conn.row_factory = sqlite3.Row
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS gateway_credentials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gateway_key_hash TEXT NOT NULL UNIQUE,
                    gateway_key_prefix TEXT NOT NULL,
                    hkbu_api_key_ciphertext BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    revoked_at TEXT
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        if self._memory_conn:
            return self._memory_conn
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode()).hexdigest()

    def create(self, hkbu_api_key: str) -> Credential:
        gateway_key = f"hkbu-gw-{secrets.token_urlsafe(32)}"
        now = datetime.now(UTC).isoformat()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO gateway_credentials
                (gateway_key_hash, gateway_key_prefix, hkbu_api_key_ciphertext, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    self._hash(gateway_key),
                    gateway_key[:12],
                    self.cipher.encrypt(hkbu_api_key.encode()),
                    now,
                ),
            )
            key_id = cursor.lastrowid
        return Credential(key_id, gateway_key, hkbu_api_key)

    def resolve(self, gateway_key: str) -> Credential | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, hkbu_api_key_ciphertext
                FROM gateway_credentials
                WHERE gateway_key_hash = ? AND revoked_at IS NULL
                """,
                (self._hash(gateway_key),),
            ).fetchone()
        if not row:
            return None
        try:
            upstream_key = self.cipher.decrypt(row["hkbu_api_key_ciphertext"]).decode()
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise RuntimeError("Stored credential could not be decrypted") from exc
        return Credential(row["id"], "", upstream_key)

    def revoke(self, gateway_key: str) -> bool:
        with self._connect() as connection:
            result = connection.execute(
                """
                UPDATE gateway_credentials
                SET revoked_at = ?
                WHERE gateway_key_hash = ? AND revoked_at IS NULL
                """,
                (datetime.now(UTC).isoformat(), self._hash(gateway_key)),
            )
        return result.rowcount == 1

    def list_public(self) -> list[dict[str, str | int]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, gateway_key_prefix, created_at, revoked_at
                FROM gateway_credentials ORDER BY id DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]
