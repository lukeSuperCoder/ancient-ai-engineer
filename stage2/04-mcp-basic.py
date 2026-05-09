#!/usr/bin/env python3
"""
04-mcp-basic.py

Stage 2 example: minimal MCP-style stdio client/server.

This is a teaching example for docs/stage2/04-MCP协议入门.md.
It intentionally avoids external dependencies and implements only the small
JSON-RPC shape needed to understand the flow:

1. Client starts an MCP server process.
2. Client sends initialize.
3. Client lists Tools, Resources, and Prompts.
4. Client calls a Tool.
5. Client reads a Resource.
6. Client gets a Prompt template.

Run the client demo:
    python3 stage2/04-mcp-basic.py

Run the server manually:
    python3 stage2/04-mcp-basic.py --server

Note:
    Real MCP servers may support more transports, richer capabilities,
    notifications, cancellation, auth, and SDK helpers. This file keeps only
    the concepts needed at this learning stage.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


JSON = dict[str, Any]
WORKDIR = Path.cwd()


TOOLS = [
    {
        "name": "get_project_info",
        "description": "Return basic information about the current project.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    },
    {
        "name": "add_numbers",
        "description": "Add two numbers and return the sum.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "First number"},
                "b": {"type": "number", "description": "Second number"},
            },
            "required": ["a", "b"],
            "additionalProperties": False,
        },
    },
]

RESOURCES = [
    {
        "uri": "demo://project/summary",
        "name": "Project summary",
        "description": "A small resource that describes the current project.",
        "mimeType": "text/plain",
    }
]

PROMPTS = [
    {
        "name": "summarize_resource",
        "description": "Prompt template for summarizing a resource.",
        "arguments": [
            {
                "name": "resource_uri",
                "description": "Resource URI to summarize.",
                "required": True,
            }
        ],
    }
]


def make_response(request_id: int | None, result: Any) -> JSON:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def make_error(request_id: int | None, code: int, message: str) -> JSON:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def read_request() -> JSON | None:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def write_message(message: JSON) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def validate_args(schema: JSON, arguments: Any) -> JSON:
    if not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")

    properties = schema.get("properties", {})
    required = schema.get("required", [])
    allow_extra = schema.get("additionalProperties", True)

    for field in required:
        if field not in arguments:
            raise ValueError(f"missing required argument: {field}")

    if not allow_extra:
        extra = set(arguments) - set(properties)
        if extra:
            raise ValueError(f"unexpected argument(s): {sorted(extra)}")

    for field, value in arguments.items():
        spec = properties.get(field)
        if not spec:
            continue
        expected = spec.get("type")
        if expected == "number" and not isinstance(value, (int, float)):
            raise ValueError(f"{field} must be a number")

    return arguments


def call_tool(name: str, arguments: JSON) -> JSON:
    if name == "get_project_info":
        schema = TOOLS[0]["inputSchema"]
        validate_args(schema, arguments)
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "cwd": str(WORKDIR),
                            "stage": "stage2",
                            "topic": "MCP basic demo",
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                }
            ]
        }

    if name == "add_numbers":
        schema = TOOLS[1]["inputSchema"]
        args = validate_args(schema, arguments)
        return {
            "content": [
                {
                    "type": "text",
                    "text": str(args["a"] + args["b"]),
                }
            ]
        }

    raise ValueError(f"unknown tool: {name}")


def read_resource(uri: str) -> JSON:
    if uri != "demo://project/summary":
        raise ValueError(f"unknown resource: {uri}")

    return {
        "contents": [
            {
                "uri": uri,
                "mimeType": "text/plain",
                "text": (
                    "This resource is served by a tiny MCP-style server. "
                    "It demonstrates that resources are read-only context, "
                    "while tools are executable actions."
                ),
            }
        ]
    }


def get_prompt(name: str, arguments: JSON) -> JSON:
    if name != "summarize_resource":
        raise ValueError(f"unknown prompt: {name}")

    resource_uri = arguments.get("resource_uri")
    if not isinstance(resource_uri, str) or not resource_uri:
        raise ValueError("resource_uri is required")

    return {
        "description": "Summarize a resource in Chinese.",
        "messages": [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": f"请总结这个资源的核心内容：{resource_uri}",
                },
            }
        ],
    }


def handle_request(request: JSON) -> JSON | None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    try:
        if method == "initialize":
            return make_response(
                request_id,
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {},
                        "resources": {},
                        "prompts": {},
                    },
                    "serverInfo": {
                        "name": "stage2-mini-mcp-server",
                        "version": "0.1.0",
                    },
                },
            )

        if method == "notifications/initialized":
            return None

        if method == "tools/list":
            return make_response(request_id, {"tools": TOOLS})

        if method == "tools/call":
            result = call_tool(params.get("name"), params.get("arguments") or {})
            return make_response(request_id, result)

        if method == "resources/list":
            return make_response(request_id, {"resources": RESOURCES})

        if method == "resources/read":
            return make_response(request_id, read_resource(params.get("uri")))

        if method == "prompts/list":
            return make_response(request_id, {"prompts": PROMPTS})

        if method == "prompts/get":
            result = get_prompt(params.get("name"), params.get("arguments") or {})
            return make_response(request_id, result)

        if method == "shutdown":
            return make_response(request_id, {})

        return make_error(request_id, -32601, f"method not found: {method}")
    except Exception as exc:
        return make_error(request_id, -32000, str(exc))


def run_server() -> None:
    while True:
        request = read_request()
        if request is None:
            break

        response = handle_request(request)
        if response is not None:
            write_message(response)

        if request.get("method") == "shutdown":
            break


@dataclass
class MiniMCPClient:
    command: list[str]
    process: subprocess.Popen | None = None
    request_id: int = 0

    def connect(self) -> None:
        self.process = subprocess.Popen(
            self.command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        result = self.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "stage2-mini-mcp-client", "version": "0.1.0"},
            },
        )
        self.notify("notifications/initialized")
        print("initialize:")
        print_json(result)

    def request(self, method: str, params: JSON | None = None) -> JSON:
        if not self.process or not self.process.stdin or not self.process.stdout:
            raise RuntimeError("MCP client is not connected")

        self.request_id += 1
        envelope = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method,
            "params": params or {},
        }
        self.process.stdin.write(json.dumps(envelope, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

        line = self.process.stdout.readline()
        if not line:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"MCP server closed stdout. stderr={stderr}")

        response = json.loads(line)
        if "error" in response:
            raise RuntimeError(response["error"]["message"])
        return response["result"]

    def notify(self, method: str, params: JSON | None = None) -> None:
        if not self.process or not self.process.stdin:
            raise RuntimeError("MCP client is not connected")
        envelope = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        self.process.stdin.write(json.dumps(envelope, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

    def close(self) -> None:
        if not self.process:
            return
        try:
            self.request("shutdown")
            self.process.wait(timeout=3)
        except Exception:
            self.process.kill()
        finally:
            self.process = None


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def run_client_demo() -> None:
    script_path = Path(__file__).resolve()
    client = MiniMCPClient(
        command=[sys.executable, str(script_path), "--server"],
    )

    try:
        client.connect()

        print("\ntools/list:")
        print_json(client.request("tools/list"))

        print("\ntools/call get_project_info:")
        print_json(
            client.request(
                "tools/call",
                {"name": "get_project_info", "arguments": {}},
            )
        )

        print("\ntools/call add_numbers:")
        print_json(
            client.request(
                "tools/call",
                {"name": "add_numbers", "arguments": {"a": 18, "b": 24}},
            )
        )

        print("\nresources/list:")
        print_json(client.request("resources/list"))

        print("\nresources/read demo://project/summary:")
        print_json(
            client.request(
                "resources/read",
                {"uri": "demo://project/summary"},
            )
        )

        print("\nprompts/list:")
        print_json(client.request("prompts/list"))

        print("\nprompts/get summarize_resource:")
        print_json(
            client.request(
                "prompts/get",
                {
                    "name": "summarize_resource",
                    "arguments": {"resource_uri": "demo://project/summary"},
                },
            )
        )
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", action="store_true", help="run as MCP server")
    args = parser.parse_args()

    if args.server:
        run_server()
    else:
        run_client_demo()


if __name__ == "__main__":
    main()
