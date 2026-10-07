import socket
from email.message import Message

import pytest
from fastapi.testclient import TestClient

from hkbu_gateway.app import app
from hkbu_gateway import webfetch


def address(ip):
    return (socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1"])
def test_non_public_dns_answers_rejected(monkeypatch, ip):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [address(ip)])
    with pytest.raises(webfetch.FetchPolicyError, match="public"):
        webfetch._public_addresses("example.com", 443)


def test_mixed_public_private_dns_rejected(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [address("1.1.1.1"), address("127.0.0.1")])
    with pytest.raises(webfetch.FetchPolicyError):
        webfetch._public_addresses("example.com", 443)


class Response:
    def __init__(self, status=200, headers=None, body=b"hello"):
        self.status, self.reason = status, "OK"
        self.headers = Message()
        for key, value in (headers or {}).items():
            self.headers[key] = value
        self.body = body

    def getheader(self, key, default=None):
        return self.headers.get(key, default)

    def read1(self, size):
        piece, self.body = self.body[:size], self.body[size:]
        return piece


class Connection:
    responses = []
    seen = []

    def __init__(self, host, port, address, timeout, secure):
        self.seen.append((host, address, secure))

    def request(self, *a, **k):
        pass

    def getresponse(self):
        return self.responses.pop(0)

    def close(self):
        pass


@pytest.fixture
def mock_connection(monkeypatch):
    Connection.responses, Connection.seen = [], []
    monkeypatch.setattr(webfetch, "_PinnedConnection", Connection)
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [address("1.1.1.1")])
    return Connection


def test_redirect_to_private_destination_rejected_before_connection(mock_connection, monkeypatch):
    mock_connection.responses = [Response(302, {"Location": "http://127.0.0.1/private"})]
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, *a, **k: [address("127.0.0.1" if host == "127.0.0.1" else "1.1.1.1")])
    with pytest.raises(webfetch.FetchPolicyError):
        webfetch.fetch_public_url("https://example.com")
    assert len(mock_connection.seen) == 1


def test_redirect_limit(mock_connection):
    mock_connection.responses = [Response(302, {"Location": "/next"}) for _ in range(4)]
    with pytest.raises(webfetch.FetchPolicyError, match="redirects"):
        webfetch.fetch_public_url("https://example.com")


@pytest.mark.parametrize("headers", [{}, {"Content-Length": str(webfetch.MAX_BODY_BYTES + 1)}])
def test_body_limit_before_decode(mock_connection, headers):
    mock_connection.responses = [Response(headers=headers, body=b"x" * (webfetch.MAX_BODY_BYTES + 1))]
    with pytest.raises(webfetch.FetchPolicyError, match="1 MiB"):
        webfetch.fetch_public_url("https://example.com")


def test_public_text_fetch(mock_connection):
    mock_connection.responses = [Response(headers={"Content-Type": "text/plain; charset=utf-8"}, body="Hello 世界".encode())]
    result = webfetch.fetch_public_url("https://example.com/page")
    assert result.text == "Hello 世界"
    assert mock_connection.seen == [("example.com", address("1.1.1.1"), True)]


def test_pinned_socket_uses_validated_address_and_original_tls_hostname(monkeypatch):
    calls = []

    class Sock:
        def settimeout(self, timeout): pass
        def connect(self, sockaddr): calls.append(("connect", sockaddr))
        def close(self): pass

    class Context:
        def wrap_socket(self, sock, server_hostname):
            calls.append(("tls", server_hostname))
            return sock

    monkeypatch.setattr(socket, "socket", lambda *a: Sock())
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: pytest.fail("Pinned connect must not resolve DNS"))
    monkeypatch.setattr(webfetch.ssl, "create_default_context", lambda: Context())
    conn = webfetch._PinnedConnection("example.com", 443, address("1.1.1.1"), 15, True)
    conn.connect()
    conn.close()
    assert calls == [("connect", ("1.1.1.1", 443)), ("tls", "example.com")]


def test_webfetch_requires_authentication(tmp_path, monkeypatch):
    monkeypatch.setenv("HKBU_DATABASE_PATH", str(tmp_path / "gateway.db"))
    with TestClient(app) as client:
        response = client.post("/api/tools/web_fetch", json={"url": "https://example.com"})
        assert response.status_code == 401
