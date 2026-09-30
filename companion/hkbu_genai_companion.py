from __future__ import annotations

import argparse
import base64
import hashlib
import json
import logging
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import threading
from typing import Any, Tuple
import urllib.parse
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler

logger = logging.getLogger("hkbu_companion")

VERSION = "2.0.0"
HOST = "127.0.0.1"


class CompanionService:
    """Core logic for companion commands, shared by HTTP and WebSocket handlers."""

    def __init__(self, base_dir: Path | str | None = None) -> None:
        if base_dir is None:
            self.base_dir = Path.cwd().resolve()
        else:
            self.base_dir = Path(base_dir).resolve()

    def resolve_path(self, req_path: str | None) -> Path:
        """Resolve a path against base_dir. Relative paths resolve inside base_dir."""
        if not req_path or req_path.strip() in ("", "."):
            return self.base_dir
        p = Path(req_path)
        if p.is_absolute():
            return p.resolve()
        return (self.base_dir / p).resolve()

    def get_healthz(self) -> dict[str, Any]:
        """Return companion health information."""
        return {
            "status": "ok",
            "service": "hkbu-genai-companion",
            "version": VERSION,
            "cwd": str(self.base_dir),
        }

    def execute_command(
        self,
        command: str,
        cwd: str | None = None,
        timeout: float = 30.0,
    ) -> dict[str, Any]:
        """Execute a shell command locally in the specified cwd."""
        if not command or not isinstance(command, str):
            return {
                "exit_code": -1,
                "stdout": "",
                "stderr": "Missing or invalid 'command' string",
                "error": "invalid_command",
            }

        exec_cwd = self.resolve_path(cwd) if cwd else self.base_dir
        if not exec_cwd.is_dir():
            exec_cwd = self.base_dir

        try:
            timeout_float = float(timeout) if timeout is not None else 30.0
            if timeout_float <= 0:
                timeout_float = 30.0
        except (ValueError, TypeError):
            timeout_float = 30.0

        try:
            proc = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                cwd=str(exec_cwd),
                timeout=timeout_float,
                errors="replace",
            )
            return {
                "exit_code": proc.returncode,
                "stdout": proc.stdout,
                "stderr": proc.stderr,
            }
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout if isinstance(exc.stdout, str) else (
                exc.stdout.decode("utf-8", errors="replace") if exc.stdout else ""
            )
            stderr = exc.stderr if isinstance(exc.stderr, str) else (
                exc.stderr.decode("utf-8", errors="replace") if exc.stderr else ""
            )
            return {
                "exit_code": -1,
                "stdout": stdout,
                "stderr": (stderr + f"\nCommand timed out after {timeout_float} seconds").strip(),
                "error": "timeout",
            }
        except Exception as exc:
            return {
                "exit_code": -1,
                "stdout": "",
                "stderr": str(exc),
                "error": str(exc),
            }

    def read_file(self, path: str | None) -> Tuple[int, dict[str, Any]]:
        """Read a file as UTF-8 text."""
        if not path:
            return 400, {"error": "Missing 'path' parameter"}
        target = self.resolve_path(path)
        if not target.exists():
            return 404, {"error": f"File not found: {path}"}
        if target.is_dir():
            return 400, {"error": f"Path is a directory: {path}"}

        try:
            content = target.read_text(encoding="utf-8", errors="replace")
            return 200, {"content": content}
        except Exception as exc:
            return 500, {"error": f"Failed to read file: {exc}"}

    def write_file(self, path: str | None, content: str | None) -> Tuple[int, dict[str, Any]]:
        """Write UTF-8 text to a file, creating parent directories if needed."""
        if not path:
            return 400, {"error": "Missing 'path' parameter"}
        if content is None:
            return 400, {"error": "Missing 'content' parameter"}

        target = self.resolve_path(path)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            return 200, {"success": True}
        except Exception as exc:
            return 500, {"error": f"Failed to write file: {exc}"}

    def list_dir(self, path: str | None = None) -> Tuple[int, dict[str, Any]]:
        """List files and directories in path."""
        target = self.resolve_path(path)
        if not target.exists():
            return 404, {"error": f"Directory not found: {path or '.'}"}
        if not target.is_dir():
            return 400, {"error": f"Path is not a directory: {path or '.'}"}

        try:
            entries = []
            for item in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                try:
                    is_dir = item.is_dir()
                    size = 0 if is_dir else item.stat().st_size
                    entries.append({
                        "name": item.name,
                        "type": "dir" if is_dir else "file",
                        "size": size,
                    })
                except (PermissionError, FileNotFoundError):
                    continue
            return 200, {"entries": entries}
        except Exception as exc:
            return 500, {"error": f"Failed to list directory: {exc}"}


class CompanionServer(ThreadingHTTPServer):
    """Threading HTTP & WebSocket server bound strictly to loopback 127.0.0.1."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        RequestHandlerClass: type[BaseHTTPRequestHandler],
        base_dir: Path | str | None = None,
    ) -> None:
        self.service = CompanionService(base_dir)
        self.is_shutting_down = False
        super().__init__(server_address, RequestHandlerClass)

    @property
    def base_dir(self) -> Path:
        return self.service.base_dir


class CompanionRequestHandler(BaseHTTPRequestHandler):
    """HTTP and WebSocket request handler with CORS support."""

    server: CompanionServer

    def log_message(self, format: str, *args: Any) -> None:
        """Suppress noisy default request logging to avoid leaking sensitive commands."""
        # Only log errors or debug messages
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            logger.warning("%s - %s", self.address_string(), format % args)

    def _send_cors_headers(self) -> None:
        """Add permissive CORS headers for local browser playground access."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def send_json(self, status: int, data: dict[str, Any]) -> None:
        """Send a JSON HTTP response with CORS headers."""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        """Respond to CORS preflight requests."""
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        """Handle HTTP GET and WebSocket upgrade requests."""
        # 1. Check for WebSocket upgrade
        if self.headers.get("Upgrade", "").strip().lower() == "websocket":
            self.handle_websocket()
            return

        # 2. Standard HTTP GET routing
        url = urllib.parse.urlparse(self.path)
        path = url.path.rstrip("/")

        if path in ("/healthz", "/api/healthz", ""):
            data = self.server.service.get_healthz()
            self.send_json(200, data)
        else:
            self.send_json(404, {"error": f"Endpoint not found: {self.path}"})

    def do_POST(self) -> None:
        """Handle HTTP POST API requests."""
        url = urllib.parse.urlparse(self.path)
        path = url.path.rstrip("/")

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except Exception as exc:
                self.send_json(400, {"error": f"Invalid JSON payload: {exc}"})
                return
        else:
            payload = {}

        if not isinstance(payload, dict):
            self.send_json(400, {"error": "JSON payload must be an object"})
            return

        # Dispatch endpoints
        if path in ("/api/execute", "/execute"):
            command = payload.get("command", "")
            cwd = payload.get("cwd")
            timeout = payload.get("timeout", 30)
            res = self.server.service.execute_command(command, cwd=cwd, timeout=timeout)
            self.send_json(200, res)

        elif path in ("/api/read_file", "/read_file", "/api/read", "/read"):
            req_path = payload.get("path")
            status, res = self.server.service.read_file(req_path)
            self.send_json(status, res)

        elif path in ("/api/write_file", "/write_file", "/api/write", "/write"):
            req_path = payload.get("path")
            content = payload.get("content")
            status, res = self.server.service.write_file(req_path, content)
            self.send_json(status, res)

        elif path in ("/api/list_dir", "/list_dir", "/api/list", "/list"):
            req_path = payload.get("path", "")
            status, res = self.server.service.list_dir(req_path)
            self.send_json(status, res)

        else:
            self.send_json(404, {"error": f"Endpoint not found: {self.path}"})

    # -------------------------------------------------------------------------
    # WebSocket RFC 6455 Minimal Server Implementation
    # -------------------------------------------------------------------------
    def handle_websocket(self) -> None:
        """Perform WebSocket handshake and process frames."""
        self.close_connection = True

        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            self.send_error(400, "Missing Sec-WebSocket-Key header")
            return

        guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        accept_raw = hashlib.sha1((key.strip() + guid).encode("utf-8")).digest()
        accept_val = base64.b64encode(accept_raw).decode("ascii")

        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept_val)
        self.end_headers()

        # Frame loop
        while not self.server.is_shutting_down:
            try:
                opcode, payload = self._read_ws_frame()
                if opcode == 0x8:  # Close
                    self._send_ws_frame(0x8, b"")
                    break
                elif opcode == 0x9:  # Ping
                    self._send_ws_frame(0xA, payload)  # Pong
                elif opcode == 0x1:  # Text
                    text = payload.decode("utf-8", errors="replace")
                    response_json = self._dispatch_ws_message(text)
                    if response_json:
                        self._send_ws_frame(0x1, response_json.encode("utf-8"))
            except (ConnectionResetError, BrokenPipeError):
                break
            except Exception:
                break

    def _read_exact(self, num_bytes: int) -> bytes:
        data = bytearray()
        while len(data) < num_bytes:
            chunk = self.rfile.read(num_bytes - len(data))
            if not chunk:
                raise ConnectionResetError("Connection closed")
            data.extend(chunk)
        return bytes(data)

    def _read_ws_frame(self) -> tuple[int, bytes]:
        header = self._read_exact(2)
        b1, b2 = header[0], header[1]
        opcode = b1 & 0x0F
        is_masked = (b2 & 0x80) != 0
        payload_len = b2 & 0x7F

        if payload_len == 126:
            ext = self._read_exact(2)
            payload_len = struct.unpack(">H", ext)[0]
        elif payload_len == 127:
            ext = self._read_exact(8)
            payload_len = struct.unpack(">Q", ext)[0]

        mask = self._read_exact(4) if is_masked else b""
        payload = self._read_exact(payload_len)

        if is_masked:
            unmasked = bytearray(payload_len)
            for i in range(payload_len):
                unmasked[i] = payload[i] ^ mask[i % 4]
            return opcode, bytes(unmasked)
        return opcode, payload

    def _send_ws_frame(self, opcode: int, payload: bytes) -> None:
        length = len(payload)
        b1 = 0x80 | (opcode & 0x0F)
        if length <= 125:
            header = bytes([b1, length])
        elif length <= 65535:
            header = bytes([b1, 126]) + struct.pack(">H", length)
        else:
            header = bytes([b1, 127]) + struct.pack(">Q", length)

        self.wfile.write(header + payload)
        self.wfile.flush()

    def _dispatch_ws_message(self, text: str) -> str:
        try:
            data = json.loads(text)
            if not isinstance(data, dict):
                return json.dumps({"error": "Payload must be a JSON object"}, ensure_ascii=False)

            msg_id = data.get("id")
            action = data.get("action")

            if action in ("healthz", "status"):
                res = self.server.service.get_healthz()
            elif action == "execute":
                res = self.server.service.execute_command(
                    data.get("command", ""),
                    cwd=data.get("cwd"),
                    timeout=data.get("timeout", 30),
                )
            elif action in ("read_file", "read"):
                _, res = self.server.service.read_file(data.get("path"))
            elif action in ("write_file", "write"):
                _, res = self.server.service.write_file(data.get("path"), data.get("content"))
            elif action in ("list_dir", "list"):
                _, res = self.server.service.list_dir(data.get("path"))
            else:
                res = {"error": f"Unknown action: {action}"}

            if msg_id is not None:
                out = {"id": msg_id, **res}
            else:
                out = res
            return json.dumps(out, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)


def print_banner(port: int, base_dir: Path) -> None:
    banner = f"""
======================================================================
  HKBU GenAI Companion v{VERSION} (Local Agent Node)
======================================================================
  Status:      RUNNING
  Host:        {HOST} (Loopback only - secure)
  Port:        {port}
  Working Dir: {base_dir}
  Endpoints:   GET  /healthz
               POST /api/execute
               POST /api/read_file
               POST /api/write_file
               POST /api/list_dir
               WS   /ws (WebSocket protocol)
----------------------------------------------------------------------
  Ready to receive requests from HKBU GenAI Playground.
  Press Ctrl+C to stop.
======================================================================
"""
    print(banner.strip(), flush=True)


def create_companion_server(
    port: int = 9001,
    base_dir: str | Path | None = None,
) -> CompanionServer:
    """Create a companion server instance bound strictly to 127.0.0.1."""
    if base_dir is None:
        resolved_dir = Path.cwd().resolve()
    else:
        resolved_dir = Path(base_dir).resolve()

    return CompanionServer((HOST, port), CompanionRequestHandler, base_dir=resolved_dir)


def run_server(port: int = 9001, base_dir: str | Path | None = None) -> None:
    """Run the companion server on 127.0.0.1."""
    server = create_companion_server(port=port, base_dir=base_dir)
    actual_port = server.server_address[1]
    print_banner(actual_port, server.base_dir)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[companion] Shutting down...")
    finally:
        server.is_shutting_down = True
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="HKBU GenAI Companion - Tier 2 Local Agent Node"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9001,
        help="Port to bind on 127.0.0.1 (default: 9001)",
    )
    parser.add_argument(
        "--dir",
        type=str,
        default=os.getcwd(),
        help="Working directory for filesystem and shell operations (default: current directory)",
    )
    args = parser.parse_args()
    run_server(port=args.port, base_dir=args.dir)


if __name__ == "__main__":
    main()
