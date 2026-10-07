from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

MAX_BODY_BYTES = 1024 * 1024
MAX_REDIRECTS = 3
FETCH_TIMEOUT = 15.0


class FetchPolicyError(ValueError):
    pass


@dataclass
class FetchResult:
    url: str
    status: int
    reason: str
    content_type: str
    text: str


def _public_addresses(host: str, port: int):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses:
        raise FetchPolicyError("The URL has no available address.")
    for family, socktype, proto, _, sockaddr in addresses:
        address = ipaddress.ip_address(sockaddr[0].split("%", 1)[0])
        if not address.is_global or address.is_multicast:
            raise FetchPolicyError("Only public internet URLs are allowed.")
    return addresses


class _PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, timeout, secure):
        super().__init__(host, port=port, timeout=timeout)
        self.address = address
        self.secure = secure

    def connect(self):
        # Connect to the exact address checked above; never resolve the host again.
        family, socktype, proto, _, sockaddr = self.address
        sock = socket.socket(family, socktype, proto)
        try:
            sock.settimeout(self.timeout)
            sock.connect(sockaddr)
            if self.secure:
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=self.host)
            self.sock = sock
        except BaseException:
            sock.close()
            raise


def fetch_public_url(url: str) -> FetchResult:
    """Fetch bounded public content without proxy use or unchecked DNS/redirects."""
    deadline = time.monotonic() + FETCH_TIMEOUT
    current = url.strip()
    if "://" not in current:
        current = "https://" + current
    for redirect in range(MAX_REDIRECTS + 1):
        parsed = urlsplit(current)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise FetchPolicyError("Only HTTP and HTTPS URLs are allowed.")
        if parsed.username is not None or parsed.password is not None:
            raise FetchPolicyError("URLs containing credentials are not allowed.")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = _public_addresses(parsed.hostname, port)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Web fetch timed out.")
        connection = _PinnedConnection(parsed.hostname, port, addresses[0], remaining, parsed.scheme == "https")
        try:
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query
            connection.request("GET", path, headers={
                "User-Agent": "HKBU-GenAI-Gateway/2.0",
                "Accept": "text/html,application/json,text/plain,*/*;q=0.8",
                "Accept-Encoding": "identity",
            })
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308) and response.getheader("Location"):
                if redirect == MAX_REDIRECTS:
                    raise FetchPolicyError("Too many redirects.")
                current = urljoin(current, response.getheader("Location"))
                continue
            encoding = response.getheader("Content-Encoding", "identity").lower()
            if encoding not in ("", "identity"):
                raise FetchPolicyError("Compressed responses are not supported.")
            length = response.getheader("Content-Length")
            if length and int(length) > MAX_BODY_BYTES:
                raise FetchPolicyError("Response exceeds the 1 MiB limit.")
            body = bytearray()
            while len(body) <= MAX_BODY_BYTES:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("Web fetch timed out.")
                piece = response.read1(min(65536, MAX_BODY_BYTES + 1 - len(body)))
                if not piece:
                    break
                body.extend(piece)
                if len(body) > MAX_BODY_BYTES:
                    raise FetchPolicyError("Response exceeds the 1 MiB limit.")
            charset = response.headers.get_content_charset() or "utf-8"
            try:
                text = body.decode(charset, errors="replace")
            except LookupError:
                text = body.decode("utf-8", errors="replace")
            return FetchResult(current, response.status, response.reason,
                               response.getheader("Content-Type", "").lower(), text)
        except http.client.HTTPException as exc:
            raise OSError("Invalid HTTP response") from exc
        finally:
            connection.close()
    raise FetchPolicyError("Too many redirects.")
