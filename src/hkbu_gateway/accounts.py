from __future__ import annotations

import argparse
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
import threading
from collections import OrderedDict
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

COOKIE = "hkbu_session"


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    ).hex()
    return salt + ":" + digest


class AccountStore:
    def __init__(self, credentials):
        self.credentials = credentials
        self.attempts = OrderedDict()
        self.attempt_lock = threading.Lock()
        self.dummy_password = password_hash(secrets.token_urlsafe(32))
        with credentials._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, recovery_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS account_sessions (hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, csrf TEXT NOT NULL, expires REAL NOT NULL);
            """)
            columns = {row[1] for row in db.execute("PRAGMA table_info(accounts)")}
            if "recovery_expires" not in columns:
                db.execute("ALTER TABLE accounts ADD COLUMN recovery_expires REAL")

    def issue_operator_recovery(self, username):
        code = secrets.token_urlsafe(32)
        with self.credentials._connect() as db:
            result = db.execute(
                "UPDATE accounts SET recovery_hash=?, recovery_expires=? WHERE username=?",
                (self.credentials._hash(code), time.time() + 900, username),
            )
            if not result.rowcount:
                raise ValueError("Account not found")
        return code

    def limit(self, key):
        with self.attempt_lock:
            now = time.time()
            entries = [t for t in self.attempts.pop(key, []) if now - t < 900]
            self.attempts[key] = entries
            while len(self.attempts) > 4096:
                self.attempts.popitem(last=False)
            if len(entries) >= 10:
                raise HTTPException(429, "Too many attempts; retry in 15 minutes")
            self.attempts[key] = entries + [now]

    def register(self, username, password):
        recovery = secrets.token_urlsafe(32)
        with self.credentials._connect() as db:
            result = db.execute("INSERT OR IGNORE INTO accounts(username,password,recovery_hash) VALUES (?,?,?)",(username,password_hash(password),self.credentials._hash(recovery)))
            if not result.rowcount:
                raise HTTPException(409,"Username already taken")
        return recovery

    def login(self, username, password):
        with self.credentials._connect() as db:
            row = db.execute("SELECT * FROM accounts WHERE username=?",(username,)).fetchone()
        expected = row["password"] if row else self.dummy_password
        valid = hmac.compare_digest(password_hash(password,expected.split(":")[0]),expected)
        if not row or not valid:
            raise HTTPException(401,"Invalid username or password")
        token,csrf = secrets.token_urlsafe(32),secrets.token_urlsafe(32)
        with self.credentials._connect() as db:
            db.execute("DELETE FROM account_sessions WHERE expires<?",(time.time(),))
            db.execute("INSERT INTO account_sessions VALUES (?,?,?,?)",(self.credentials._hash(token),row["id"],csrf,time.time()+604800))
        return token,{"id":row["id"],"username":username,"csrf":csrf}

    def recover(self, username, code, password):
        recovery = secrets.token_urlsafe(32)
        with self.credentials._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id,recovery_hash,recovery_expires FROM accounts WHERE username=?",(username,)).fetchone()
            if not row or not hmac.compare_digest(row["recovery_hash"],self.credentials._hash(code)):
                raise HTTPException(401,"Invalid username or recovery code")
            if row["recovery_expires"] is not None and row["recovery_expires"] <= time.time():
                raise HTTPException(401, "Recovery code expired")
            db.execute("UPDATE accounts SET password=?,recovery_hash=?,recovery_expires=NULL WHERE id=?",(password_hash(password),self.credentials._hash(recovery),row["id"]))
            db.execute("DELETE FROM account_sessions WHERE account_id=?",(row["id"],))
        return recovery

    def logout(self, token):
        with self.credentials._connect() as db:
            db.execute("DELETE FROM account_sessions WHERE hash=?",(self.credentials._hash(token),))

    def session(self, request):
        with self.credentials._connect() as db:
            row = db.execute("SELECT a.id,a.username,s.csrf FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires>?",(self.credentials._hash(request.cookies.get(COOKIE,"")),time.time())).fetchone()
        if not row:
            raise HTTPException(401,"Sign in to manage your API keys")
        return dict(row)


def check_origin(request):
    if request.headers.get("origin") != str(request.base_url).rstrip("/") or request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403,"Same-origin request required")


def require_account(request: Request):
    user = request.app.state.accounts.session(request)
    if request.method not in ("GET","HEAD"):
        check_origin(request)
        if not hmac.compare_digest(request.headers.get("x-csrf-token",""),user["csrf"]):
            raise HTTPException(403,"Invalid CSRF token")
    return user


class AuthBody(BaseModel):
    username: str = Field(min_length=3,max_length=40)
    password: str = Field(min_length=12,max_length=256)
    password_confirmation: str = Field(default="",max_length=256)
    recovery_code: str = Field(default="",max_length=256)


router = APIRouter(prefix="/api/account")

@router.get("/session")
def get_session(request: Request):
    return require_account(request)

@router.post("/logout")
def logout(request: Request,response: Response):
    require_account(request)
    request.app.state.accounts.logout(request.cookies.get(COOKIE,""))
    response.delete_cookie(COOKIE,path="/")
    return {"message":"Signed out"}

@router.post("/{action}")
def account_action(action: str,body: AuthBody,request: Request,response: Response):
    check_origin(request)
    store = request.app.state.accounts
    username = body.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_][a-z0-9_.-]{2,39}",username):
        raise HTTPException(400,"Username must be 3–40 letters, numbers, underscores, dots or hyphens")
    store.limit((request.client.host if request.client else "unknown",action))
    store.limit((username,action))
    if action in ("register","recover") and body.password != body.password_confirmation:
        raise HTTPException(400,"Passwords do not match")
    if action == "register":
        return {"recovery_code":store.register(username,body.password),"message":"Save your recovery code; it cannot be shown again."}
    if action == "recover":
        return {"recovery_code":store.recover(username,body.recovery_code,body.password),"message":"Password reset. Save the new recovery code and sign in."}
    if action != "login":
        raise HTTPException(404,"Unknown account action")
    token,user = store.login(username,body.password)
    response.set_cookie(COOKIE,token,httponly=True,secure=request.url.scheme == "https",samesite="strict",max_age=604800,path="/")
    return user


def operator_recovery_cli(argv=None):
    """Local filesystem access is the authority; no HTTP administrator interface."""
    parser = argparse.ArgumentParser(description="Issue a 15-minute gateway account reset code")
    parser.add_argument("--database", required=True, help="Existing gateway SQLite database")
    parser.add_argument("--username", required=True)
    args = parser.parse_args(argv)
    database = Path(args.database)
    if not database.is_file():
        parser.error("Database must be an existing file; no database was created")
    # Validate this is an existing account database before any migration/write.
    with sqlite3.connect("file:" + str(database.resolve()) + "?mode=ro", uri=True) as db:
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").fetchone()
    if not exists:
        parser.error("Database has no accounts table")
    from .credentials import CredentialStore
    store = AccountStore(CredentialStore(str(database), os.getenv("HKBU_GATEWAY_ENCRYPTION_KEY")))
    try:
        code = store.issue_operator_recovery(args.username.strip().lower())
    except ValueError as exc:
        parser.error(str(exc))
    print("Single-use recovery code (expires in 15 minutes): " + code)
    print("Give this code privately to the account owner. The prior recovery code is replaced.")
    print("Sessions are invalidated when the owner resets the password.")
    return code


if __name__ == "__main__":
    operator_recovery_cli()
