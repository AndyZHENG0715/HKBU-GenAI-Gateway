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
