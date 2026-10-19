from __future__ import annotations

import sqlite3
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from hkbu_gateway.accounts import AccountStore, COOKIE, router, require_account, operator_recovery_cli
from hkbu_gateway.credentials import CredentialStore


def request(token):
    return SimpleNamespace(cookies={COOKIE:token})


def test_recovery_rotates_and_invalidates_sessions():
    store = AccountStore(CredentialStore(":memory:"))
    recovery = store.register("andy","long enough password")
    token,user = store.login("andy","long enough password")
    assert store.session(request(token))["id"] == user["id"]
    with pytest.raises(HTTPException):
        store.recover("andy","wrong-code","new long password")
    replacement = store.recover("andy",recovery,"new long password")
    assert replacement != recovery
    with pytest.raises(HTTPException):
        store.session(request(token))
    with pytest.raises(HTTPException):
        store.recover("andy",recovery,"another password")
    store.login("andy","new long password")
    with store.credentials._connect() as db:
        row = db.execute("SELECT * FROM accounts").fetchone()
    assert row["password"] != "new long password"
    assert row["recovery_hash"] != replacement


def test_owner_isolation_claim_and_legacy_migration(tmp_path):
    path = str(tmp_path / "old.db")
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE gateway_credentials(id INTEGER PRIMARY KEY AUTOINCREMENT,gateway_key_hash TEXT UNIQUE NOT NULL,gateway_key_prefix TEXT NOT NULL,hkbu_api_key_ciphertext BLOB NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT)")
    store = CredentialStore(path)
    legacy = store.create("upstream-secret")
    assert store.list_owned(1) == []
    assert not store.claim(1,"wrong")
    assert store.claim(1,legacy.gateway_key)
    assert not store.claim(2,legacy.gateway_key)
    assert store.list_owned(2) == []
    assert not store.revoke_owned(2,legacy.key_id)
    assert store.resolve(legacy.gateway_key).hkbu_api_key == "upstream-secret"
    assert store.revoke_owned(1,legacy.key_id)
    assert store.resolve(legacy.gateway_key) is None
    created = store.create("second",2,"Laptop")
    assert store.list_owned(2)[0]["name"] == "Laptop"
    assert created.gateway_key not in str(store.list_owned(2))


def test_auth_confirmation_origin_csrf_and_logout():
    app = FastAPI()
    app.state.credentials = CredentialStore(":memory:")
    app.state.accounts = AccountStore(app.state.credentials)
    app.include_router(router)
    with TestClient(app) as client:
        body = {"username":"andy","password":"long enough password","password_confirmation":"mismatch"}
        assert client.post("/api/account/register",json=body,headers={"Origin":"http://testserver"}).status_code == 400
        body["password_confirmation"] = body["password"]
        assert client.post("/api/account/register",json=body,headers={"Origin":"https://evil.example"}).status_code == 403
        result = client.post("/api/account/register",json=body,headers={"Origin":"http://testserver"})
        assert result.status_code == 200 and result.json()["recovery_code"]
        login = client.post("/api/account/login",json=body,headers={"Origin":"http://testserver"})
        assert "httponly" in login.headers["set-cookie"].lower()
        assert "samesite=strict" in login.headers["set-cookie"].lower()
        session = client.get("/api/account/session").json()
        assert "password" not in session
        assert client.post("/api/account/logout",headers={"Origin":"http://testserver"}).status_code == 403
        assert client.post("/api/account/logout",headers={"Origin":"http://testserver","X-CSRF-Token":session["csrf"]}).status_code == 200
        assert client.get("/api/account/session").status_code == 401


def test_rate_limit_is_bounded():
    store = AccountStore(CredentialStore(":memory:"))
    for i in range(10):
        store.limit("same")
    with pytest.raises(HTTPException) as exc:
        store.limit("same")
    assert exc.value.status_code == 429
    for i in range(5000):
        store.limit(i)
    assert len(store.attempts) == 4096


def test_operator_code_expiry_single_use_and_sessions(monkeypatch):
    store = AccountStore(CredentialStore(":memory:"))
    original = store.register("andy", "long enough password")
    token, _ = store.login("andy", "long enough password")
    clock = [1000.0]
    monkeypatch.setattr("hkbu_gateway.accounts.time.time", lambda: clock[0])
    expired = store.issue_operator_recovery("andy")
    with pytest.raises(HTTPException):
        store.recover("andy", original, "replacement password")
    clock[0] += 901
    with pytest.raises(HTTPException) as exc:
        store.recover("andy", expired, "replacement password")
    assert exc.value.status_code == 401
    code = store.issue_operator_recovery("andy")
    replacement = store.recover("andy", code, "replacement password")
    assert replacement != code
    with pytest.raises(HTTPException):
        store.recover("andy", code, "another replacement")
    with pytest.raises(HTTPException):
        store.session(request(token))
    store.login("andy", "replacement password")


def test_operator_cli_missing_database_does_not_create_files(tmp_path):
    missing = tmp_path / "missing.db"
    with pytest.raises(SystemExit):
        operator_recovery_cli(["--database", str(missing), "--username", "andy"])
    assert list(tmp_path.iterdir()) == []


def test_key_management_endpoints_enforce_ownership(monkeypatch, tmp_path):
    from hkbu_gateway.app import app
    monkeypatch.setenv("HKBU_DATABASE_PATH", str(tmp_path / "gateway.db"))

    credentials = CredentialStore(":memory:")
    app.state.credentials = credentials
    app.state.accounts = AccountStore(credentials)

    class Provider:
        async def list_models(self, key):
            # Key validation lists models instead of spending quota on a chat call.
            assert key == "university-key"
            return [{"id": "gpt-6-luna", "object": "model"}]

    app.state.provider = Provider()
    with TestClient(app, raise_server_exceptions=True) as client:
        # Lifespan initializes production state; replace it with isolated test state.
        app.state.credentials = credentials
        app.state.accounts = AccountStore(credentials)
        app.state.provider = Provider()
        origin = {"Origin": "http://testserver"}
        assert client.get("/api/credentials").status_code == 401
        def sign_in(username):
            body = {"username": username, "password": "long enough password", "password_confirmation": "long enough password"}
            assert client.post("/api/account/register", json=body, headers=origin).status_code == 200
            result = client.post("/api/account/login", json=body, headers=origin)
            assert result.status_code == 200
            return dict(origin, **{"X-CSRF-Token": result.json()["csrf"]})

        owner = sign_in("owner")
        created = client.post("/api/credentials", json={"hkbu_api_key": "university-key", "name": "Laptop"}, headers=owner)
        assert created.status_code == 200
        key = created.json()
        assert client.get("/api/credentials").json()[0]["id"] == key["id"]
        other = sign_in("other")
        assert client.get("/api/credentials").json() == []
        assert client.delete(f'/api/credentials/{key["id"]}', headers=other).status_code == 404
        assert client.post("/api/credentials/claim", json={"api_key": key["api_key"]}, headers=other).status_code == 400
        assert credentials.resolve(key["api_key"]) is not None

