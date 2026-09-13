import hashlib
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime

from cryptography.fernet import Fernet, InvalidToken


@dataclass(frozen=True)
class Credential:
    key_id: int
    gateway_key: str
    hkbu_api_key: str


class CredentialStore:
    def __init__(self, database_path: str, encryption_key: str | None):
        if not encryption_key:
            raise RuntimeError(
                "HKBU_GATEWAY_ENCRYPTION_KEY must be configured for credential management"
            )
        try:
            self.cipher = Fernet(encryption_key.encode())
        except ValueError as exc:
            raise RuntimeError(
                "HKBU_GATEWAY_ENCRYPTION_KEY must be a valid Fernet key"
            ) from exc
        self.database_path = database_path
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
