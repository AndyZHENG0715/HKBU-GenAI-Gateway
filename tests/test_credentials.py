from cryptography.fernet import Fernet

from hkbu_gateway.credentials import CredentialStore


def test_gateway_key_is_one_time_resolvable_and_revocable(tmp_path):
    store = CredentialStore(str(tmp_path / "gateway.db"), Fernet.generate_key().decode())
    created = store.create("hkbu-secret")

    resolved = store.resolve(created.gateway_key)
    assert resolved is not None
    assert resolved.hkbu_api_key == "hkbu-secret"
    assert store.revoke(created.gateway_key)
    assert store.resolve(created.gateway_key) is None


def test_database_does_not_contain_plaintext_key(tmp_path):
    path = tmp_path / "gateway.db"
    store = CredentialStore(str(path), Fernet.generate_key().decode())
    store.create("hkbu-secret")
    assert b"hkbu-secret" not in path.read_bytes()


def test_auto_generated_key_persists_alongside_database(tmp_path):
    db_path = tmp_path / "gateway.db"
    key_path = tmp_path / "gateway.key"

    # Store 1 initializes with no encryption key provided -> auto generates and saves to key_path
    store1 = CredentialStore(str(db_path))
    assert key_path.exists()
    assert len(key_path.read_text().strip()) > 0
    created = store1.create("student-secret-key")

    # Store 2 initializes with no encryption key provided -> loads key_path and can decrypt
    store2 = CredentialStore(str(db_path))
    resolved = store2.resolve(created.gateway_key)
    assert resolved is not None
    assert resolved.hkbu_api_key == "student-secret-key"


def test_in_memory_database_auto_generates_key():
    store = CredentialStore(":memory:")
    created = store.create("student-secret-key")
    resolved = store.resolve(created.gateway_key)
    assert resolved is not None
    assert resolved.hkbu_api_key == "student-secret-key"
