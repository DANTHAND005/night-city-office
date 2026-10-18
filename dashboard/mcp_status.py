"""Which MCP servers are connected: feeds the MCP hologram and the chips in the lead panel. Read-only, costs no tokens.
Claude's own list comes from `claude mcp list`; Roblox Studio is checked with a real handshake, Blender by its add-on port.
The result is cached and refreshed in the background so the page never waits."""
import json
import queue
import socket
import subprocess
import threading
import time

from fastapi import APIRouter

from . import lead

router = APIRouter()
MCP_FILE = lead.Path(r"C:\agents\lead_mcp.json")
ROBLOX_CMD = r"C:\agents\roblox_mcp.cmd"
BLENDER_PORT = 9876  # the community Blender add-on listens here
REFRESH_S = 120
_state = {"at": 0.0, "items": [], "busy": False}
_lock = threading.Lock()


def _claude_list():
    """name -> (state, detail) for every server Claude Code knows about."""
    try:
        p = subprocess.run([lead.CLAUDE, "mcp", "list"], capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=90, cwd=lead.WORKDIR, creationflags=lead.CREATE_NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    out = {}
    for line in (p.stdout or "").splitlines():
        name, sep, rest = line.partition(": ")
        if not sep or " - " not in rest:
            continue
        tail = rest.rpartition(" - ")[2]
        if "Not configured" in tail:
            continue
        state = "connected" if "Connected" in tail else "auth" if "authentication" in tail else "failed"
        out[name.strip()] = (state, "".join(ch for ch in tail if " " <= ch <= "~").strip(" -")[:90])
    return out


def _label(name):
    return name.replace("claude.ai ", "").rsplit(":", 1)[-1].replace("-", " ").strip().title()


def _roblox():
    """Start the Studio bridge, ask for its tools, stop it. Zero tools means Studio is closed or its MCP server is off."""
    try:
        proc = subprocess.Popen(["cmd.exe", "/c", ROBLOX_CMD], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, encoding="utf-8", errors="replace", creationflags=lead.CREATE_NO_WINDOW)
    except OSError as e:
        return "failed", f"cannot start the bridge: {e}"[:90]
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(ln) for ln in proc.stdout], daemon=True).start()
    send = lambda o: (proc.stdin.write(json.dumps(o) + "\n"), proc.stdin.flush())
    count = -1
    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                                                                           "clientInfo": {"name": "night-city-office", "version": "1"}}})
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        end = time.time() + 12
        while time.time() < end:
            try:
                msg = json.loads(lines.get(timeout=1))
            except (queue.Empty, ValueError):
                continue
            if msg.get("id") == 2:
                count = len((msg.get("result") or {}).get("tools") or [])
                break
    except OSError:
        pass
    finally:  # kill the whole tree: killing only cmd.exe leaves StudioMCP.exe running
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, creationflags=lead.CREATE_NO_WINDOW)
    if count > 0:
        return "connected", f"{count} tools ready"
    return "disconnected", "Studio closed, or Enable Studio as MCP server is off" if count == 0 else "bridge did not answer"


def _blender():
    if "blender" not in _configured():
        up = _port(BLENDER_PORT)
        return ("connected", "add-on is listening (not in lead_mcp.json yet)") if up else ("disconnected", "not set up yet")
    return ("connected", "add-on is listening") if _port(BLENDER_PORT) else ("disconnected", "open Blender and connect the add-on")


def _port(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.6):
            return True
    except OSError:
        return False


def _configured():
    try:
        return set(json.loads(MCP_FILE.read_text(encoding="utf-8")).get("mcpServers", {}))
    except (OSError, ValueError):
        return set()


def _refresh():
    try:
        known = _claude_list()
        items = []
        state, detail = _roblox()
        items.append({"key": "roblox", "label": "Roblox Studio", "state": state, "detail": detail, "ours": True})
        state, detail = _blender()
        items.append({"key": "blender", "label": "Blender", "state": state, "detail": detail, "ours": True})
        figma = next((v for k, v in known.items() if k.endswith(":figma")), None)
        state, detail = figma or ("disconnected", "not installed")
        items.append({"key": "figma", "label": "Figma", "state": state,
                      "detail": "sign in once to connect" if state == "auth" else detail, "ours": True})
        rest = [{"key": k, "label": _label(k), "state": s, "detail": d, "ours": False} for k, (s, d) in known.items() if not k.endswith(":figma")]
        rest.sort(key=lambda i: (i["state"] != "connected", i["label"]))
        with _lock:
            _state.update(at=time.time(), items=items + rest)
    finally:
        with _lock:
            _state["busy"] = False


def _kick():
    with _lock:
        if _state["busy"]:
            return
        _state["busy"] = True
    threading.Thread(target=_refresh, name="mcp-status", daemon=True).start()


@router.get("/api/mcp/status")
def status(refresh: bool = False):
    if refresh or time.time() - _state["at"] > REFRESH_S:
        _kick()
    with _lock:
        items, at, busy = list(_state["items"]), _state["at"], _state["busy"]
    up = sum(1 for i in items if i["state"] == "connected")
    return {"items": items, "up": up, "total": len(items), "checking": busy, "age": round(time.time() - at) if at else None}
