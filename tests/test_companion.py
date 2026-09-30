from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import json
import socket
import struct
import base64
import threading
import time
import urllib.request
import urllib.error
from typing import Generator, Tuple, Any

import pytest

from companion.hkbu_genai_companion import (
    create_companion_server,
    CompanionServer,
    VERSION,
    HOST,
)


@pytest.fixture(scope="module")
def server_info(tmp_path_factory: pytest.TempPathFactory) -> Generator[Tuple[str, int, Path], None, None]:
    base_dir = tmp_path_factory.mktemp("companion_workspace")
    server = create_companion_server(port=0, base_dir=base_dir)
    port = server.server_address[1]
    base_url = f"http://{HOST}:{port}"

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    yield base_url, port, base_dir

    server.is_shutting_down = True
    server.shutdown()
    server.server_close()


def make_request(
    url: str,
    method: str = "GET",
    data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, Any], dict[str, str]]:
    req_headers = {"User-Agent": "test-client"}
    if headers:
        req_headers.update(headers)

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    try:
        with opener.open(req) as resp:
            resp_headers = {k.lower(): v for k, v in resp.getheaders()}
            raw = resp.read()
            resp_data = json.loads(raw.decode("utf-8")) if raw else {}
            return resp.status, resp_data, resp_headers
    except urllib.error.HTTPError as err:
        resp_headers = {k.lower(): v for k, v in err.headers.items()}
        raw = err.read()
        resp_data = json.loads(raw.decode("utf-8")) if raw else {}
        return err.code, resp_data, resp_headers


def test_host_binding_invariant() -> None:
    """Ensure companion binds ONLY to 127.0.0.1 for security."""
    assert HOST == "127.0.0.1"


def test_healthz_endpoint(server_info: Tuple[str, int, Path]) -> None:
    base_url, port, base_dir = server_info
    status, data, headers = make_request(f"{base_url}/healthz")

    assert status == 200
    assert data.get("status") == "ok"
    assert data.get("service") == "hkbu-genai-companion"
    assert data.get("version") == VERSION
    assert data.get("cwd") == str(base_dir.resolve())
    assert headers.get("access-control-allow-origin") == "*"
    assert "OPTIONS" in headers.get("access-control-allow-methods", "")


def test_cors_options_preflight(server_info: Tuple[str, int, Path]) -> None:
    base_url, port, _ = server_info
    status, _, headers = make_request(
        f"{base_url}/api/execute",
        method="OPTIONS",
        headers={"Origin": "http://localhost:8000", "Access-Control-Request-Method": "POST"},
    )

    assert status == 204
    assert headers.get("access-control-allow-origin") == "*"
    assert "POST" in headers.get("access-control-allow-methods", "")
    assert headers.get("access-control-allow-headers") == "*"


def test_execute_success(server_info: Tuple[str, int, Path]) -> None:
    base_url, _, _ = server_info
    status, data, headers = make_request(
        f"{base_url}/api/execute",
        method="POST",
        data={"command": "echo 'companion test output'"},
    )

    assert status == 200
    assert data["exit_code"] == 0
    assert "companion test output" in data["stdout"]
    assert data["stderr"] == ""
    assert headers.get("access-control-allow-origin") == "*"


def test_execute_non_zero_exit(server_info: Tuple[str, int, Path]) -> None:
    base_url, _, _ = server_info
    status, data, _ = make_request(
        f"{base_url}/api/execute",
        method="POST",
        data={"command": "python3 -c 'import sys; sys.exit(42)'"},
    )

    assert status == 200
    assert data["exit_code"] == 42


def test_execute_timeout(server_info: Tuple[str, int, Path]) -> None:
    base_url, _, _ = server_info
    status, data, _ = make_request(
        f"{base_url}/api/execute",
        method="POST",
        data={
            "command": "python3 -c 'import time; time.sleep(2)'",
            "timeout": 0.2,
        },
    )

    assert status == 200
    assert data["exit_code"] == -1
    assert data.get("error") == "timeout"
    assert "timed out" in data["stderr"]


def test_file_operations(server_info: Tuple[str, int, Path]) -> None:
    base_url, _, base_dir = server_info
    rel_path = "subfolder/hello.txt"
    test_content = "Hello from companion test\nLine 2"

    # 1. Write file
    status, write_res, _ = make_request(
        f"{base_url}/api/write_file",
        method="POST",
        data={"path": rel_path, "content": test_content},
    )
    assert status == 200
    assert write_res.get("success") is True
    assert (base_dir / rel_path).exists()

    # 2. Read file
    status, read_res, _ = make_request(
        f"{base_url}/api/read_file",
        method="POST",
        data={"path": rel_path},
    )
    assert status == 200
    assert read_res.get("content") == test_content

    # 3. Read non-existent file
    status, err_res, _ = make_request(
        f"{base_url}/api/read_file",
        method="POST",
        data={"path": "non_existent.txt"},
    )
    assert status == 404
    assert "not found" in err_res.get("error", "").lower()

    # 4. List directory
    status, list_res, _ = make_request(
        f"{base_url}/api/list_dir",
        method="POST",
        data={"path": "subfolder"},
    )
    assert status == 200
    entries = list_res.get("entries", [])
    assert any(e["name"] == "hello.txt" and e["type"] == "file" for e in entries)


def test_aliases_endpoints(server_info: Tuple[str, int, Path]) -> None:
    base_url, _, _ = server_info

    # /execute alias
    status, data, _ = make_request(
        f"{base_url}/execute",
        method="POST",
        data={"command": "echo 'alias test'"},
    )
    assert status == 200
    assert "alias test" in data["stdout"]

    # /write alias
    status, data, _ = make_request(
        f"{base_url}/write",
        method="POST",
        data={"path": "alias_file.txt", "content": "alias content"},
    )
    assert status == 200
    assert data.get("success") is True

    # /read alias
    status, data, _ = make_request(
        f"{base_url}/read",
        method="POST",
        data={"path": "alias_file.txt"},
    )
    assert status == 200
    assert data.get("content") == "alias content"

    # /list alias
    status, data, _ = make_request(
        f"{base_url}/list",
        method="POST",
        data={},
    )
    assert status == 200
    assert any(e["name"] == "alias_file.txt" for e in data.get("entries", []))


def test_websocket_protocol(server_info: Tuple[str, int, Path]) -> None:
    """Verify WebSocket handshake and frame exchange using pure Python stdlib sockets."""
    _, port, _ = server_info

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5.0)
    sock.connect((HOST, port))

    # Perform handshake
    sec_key = base64.b64encode(b"test-ws-nonce-1234").decode("ascii")
    handshake = (
        f"GET /ws HTTP/1.1\r\n"
        f"Host: {HOST}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {sec_key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(handshake.encode("ascii"))

    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = sock.recv(1024)
        if not chunk:
            break
        resp += chunk

    assert b"101 Switching Protocols" in resp
    assert b"Sec-WebSocket-Accept" in resp

    # Send client text frame (opcode 1, masked)
    payload_str = json.dumps({"id": "ws-1", "action": "execute", "command": "echo 'ws-works'"})
    payload = payload_str.encode("utf-8")
    mask = b"\x12\x34\x56\x78"
    masked_payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))

    frame = bytearray([0x81, 0x80 | len(payload)]) + mask + masked_payload
    sock.sendall(frame)

    # Read server frame (unmasked)
    header = sock.recv(2)
    assert len(header) == 2
    opcode = header[0] & 0x0F
    assert opcode == 1  # Text frame
    length = header[1] & 0x7F

    server_payload = sock.recv(length)
    res_data = json.loads(server_payload.decode("utf-8"))

    assert res_data.get("id") == "ws-1"
    assert res_data.get("exit_code") == 0
    assert "ws-works" in res_data.get("stdout", "")

    # Close WebSocket cleanly
    close_frame = bytearray([0x88, 0x80]) + mask
    sock.sendall(close_frame)
    sock.close()
