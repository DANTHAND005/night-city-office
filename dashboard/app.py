"""Night City Office: a local task dashboard for the LiteLLM roles.

Start it with C:\\agents\\start_dashboard.ps1 (binds to 127.0.0.1:8080 only).
"""
import json
import mimetypes
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import apply, autopilot, backlog, db, extras, lead, mcp_status, research, worker

mimetypes.add_type("font/ttf", ".ttf")  # Windows' registry often has no type for .ttf
STATIC = Path(__file__).resolve().parent / "static"
PORT = int(os.environ.get("DASHBOARD_PORT", "8080"))
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ALLOWED_ORIGINS = {f"http://{host}" for host in ALLOWED_HOSTS}
# Everything the page needs is served from here; the browser blocks any other origin.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")

Role = Literal["coder", "planner", "vision", "memory", "trimmer"]

# The office scene: background, optional portraits and station layout, from one asset folder in the vault.
OFFICE_DIR = Path(r"C:\Vault\assets\office")
LAYOUT_FILE = OFFICE_DIR / "layout.json"
CrewName = Literal["lucy", "rebecca", "kiwi", "maine", "falco", "david"]
CREW_NAMES = CrewName.__args__
DEFAULT_LAYOUT = {"lucy": {"x": 20, "y": 60}, "rebecca": {"x": 9, "y": 58}, "kiwi": {"x": 58, "y": 64},
                  "maine": {"x": 68, "y": 52}, "falco": {"x": 76, "y": 62}, "david": {"x": 45, "y": 86}}
workers = worker.Workers()


@asynccontextmanager
async def lifespan(app):
    for task_id in db.init_db():
        worker.write_note(db.get_task(task_id))
    lead.init()
    backlog.init()
    autopilot.init()
    workers.start()
    yield
    workers.shutdown()


# docs_url etc. are off: the API docs page loads scripts from a CDN.
app = FastAPI(title="Night City Office", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


app.include_router(extras.router)
app.include_router(lead.router)
app.include_router(backlog.router)
app.include_router(apply.router)
app.include_router(mcp_status.router)
app.include_router(research.router)
app.include_router(autopilot.router)


@app.middleware("http")
async def local_only(request: Request, call_next):
    # Host check blocks DNS-rebinding; Origin + JSON-only writes block other sites posting from the browser.
    if request.headers.get("host", "") not in ALLOWED_HOSTS:
        response = JSONResponse({"detail": "unknown host"}, status_code=400)
    elif request.method not in ("GET", "HEAD") and (
            request.headers.get("origin", next(iter(ALLOWED_ORIGINS))) not in ALLOWED_ORIGINS):
        response = JSONResponse({"detail": "cross-origin request refused"}, status_code=403)
    elif request.method not in ("GET", "HEAD") and not request.headers.get("content-type", "").startswith(
            "application/json"):
        response = JSONResponse({"detail": "send JSON"}, status_code=415)
    else:
        response = await call_next(request)
    response.headers["Content-Security-Policy"] = CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


class Step(BaseModel):
    role: Role
    instruction: str = Field("", max_length=4000)


class TaskIn(BaseModel):
    role: Role
    input: str = Field(min_length=1, max_length=200_000)
    title: str = Field("", max_length=200)
    image_path: Optional[str] = Field(None, max_length=1000)
    timeout_s: int = Field(300, ge=1, le=3600)
    next_steps: list[Step] = Field(default_factory=list, max_length=3)


class HandoffIn(BaseModel):
    role: Role
    instruction: str = Field("", max_length=4000)
    timeout_s: Optional[int] = Field(None, ge=1, le=3600)


def default_title(text):
    first = next((line.strip() for line in text.splitlines() if line.strip()), "untitled")
    first = re.sub(r"\s+", " ", first)
    return first if len(first) <= 60 else first[:59] + "…"


def checked_image(raw, role):
    if not raw or not raw.strip():
        return None
    if role != "vision":
        raise HTTPException(422, "only the vision role can read images")
    try:
        return worker.check_image_path(raw)
    except ValueError as e:
        raise HTTPException(422, str(e))


def existing(task_id):
    task = db.get_task(task_id)
    if task is None:
        raise HTTPException(404, f"task #{task_id} not found")
    return task


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
# Read-only; StaticFiles refuses paths (and links) that resolve outside this folder.
app.mount("/office", StaticFiles(directory=OFFICE_DIR, check_dir=False), name="office")


def read_layout():
    """layout.json merged over the defaults; entries that aren't a known name with x and y in 0-100 are ignored."""
    layout = {name: dict(spot) for name, spot in DEFAULT_LAYOUT.items()}
    try:
        saved = json.loads(LAYOUT_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return layout
    for name, spot in (saved.items() if isinstance(saved, dict) else ()):
        if name not in layout or not isinstance(spot, dict):
            continue
        try:
            x, y = float(spot["x"]), float(spot["y"])
        except (KeyError, TypeError, ValueError):
            continue
        if 0 <= x <= 100 and 0 <= y <= 100:
            layout[name] = {"x": x, "y": y}
    return layout


class Spot(BaseModel):
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class LayoutIn(BaseModel):
    stations: dict[CrewName, Spot] = Field(min_length=1)


@app.get("/api/office")
def office():
    portraits = {name: f"/office/characters/{name}.png" for name in CREW_NAMES
                 if (OFFICE_DIR / "characters" / f"{name}.png").is_file()}
    room = "/office/room.jpg" if (OFFICE_DIR / "room.jpg").is_file() else None
    return {"room": room, "layout": read_layout(), "portraits": portraits}


@app.post("/api/layout")
def save_layout(body: LayoutIn):
    layout = read_layout()
    for name, spot in body.stations.items():
        layout[name] = {"x": round(spot.x, 2), "y": round(spot.y, 2)}
    tmp = LAYOUT_FILE.with_name(LAYOUT_FILE.name + ".tmp")
    try:
        OFFICE_DIR.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, LAYOUT_FILE)  # all or nothing: never a half-written layout.json
    except OSError as e:
        raise HTTPException(500, f"could not save the layout: {e}")
    return {"layout": layout}


@app.get("/api/roles")
def roles():
    roles_out = [{**r, "lane": worker.LANE_OF[r["role"]]} for r in db.role_status()]
    boss = lead.active()  # Claude Code shows as busy while the lead is planning or reviewing
    if boss:
        roles_out.append({"role": "claude-code", "busy": boss["status"] in ("planning", "reviewing"),
                          "task_id": None, "task_title": boss["title"] or "leading a project", "started": None,
                          "last_task_id": None, "last_duration_s": None, "last_status": None, "lane": "cloud"})
    return {"roles": roles_out, "server_time": time.time()}


@app.get("/api/tasks")
def tasks():
    return {"columns": db.board(), "server_time": time.time()}


@app.get("/api/tasks/{task_id}")
def task(task_id: int):
    found = existing(task_id)
    found["children"] = db.children(task_id)
    return found


@app.post("/api/tasks", status_code=201)
def create_task(body: TaskIn):
    if not body.input.strip():
        raise HTTPException(422, "input is empty")
    task_id = db.create_task(
        title=body.title.strip() or default_title(body.input),
        role=body.role,
        input=body.input,
        image_path=checked_image(body.image_path, body.role),
        timeout_s=body.timeout_s,
        next_steps=[step.model_dump() for step in body.next_steps],
    )
    return {"id": task_id}


@app.post("/api/tasks/{task_id}/handoff", status_code=201)
def handoff(task_id: int, body: HandoffIn):
    source = existing(task_id)
    if source["status"] != "done":
        raise HTTPException(409, "only done tasks can be handed off")
    new_id = worker.spawn_follow_up(source, {"role": body.role, "instruction": body.instruction}, [],
                                    timeout_s=body.timeout_s)
    return {"id": new_id}


@app.post("/api/tasks/{task_id}/retry", status_code=201)
def retry(task_id: int):
    source = existing(task_id)
    if source["status"] != "failed":
        raise HTTPException(409, "only failed tasks can be retried")
    new_id = db.create_task(
        title=source["title"], role=source["role"], input=source["input"],
        image_path=checked_image(source["image_path"], source["role"]),
        timeout_s=source["timeout_s"], next_steps=source["next_steps"],
        parent_task_id=source["parent_task_id"], created_by=source["created_by"],
    )
    return {"id": new_id}


@app.post("/api/tasks/{task_id}/cancel")
def cancel(task_id: int):
    existing(task_id)
    cancelled = db.cancel_task(task_id)
    if cancelled is None:
        raise HTTPException(409, "only queued tasks can be cancelled")
    worker.write_note(cancelled)
    return {"id": task_id, "status": cancelled["status"]}
