"""SQLite storage for the dashboard's task queue. Every call opens its own short-lived connection."""
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "tasks.db"
ROLES = ("coder", "planner", "vision", "memory", "trimmer")
STATUSES = ("queued", "running", "done", "failed")

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    role           TEXT    NOT NULL,
    input          TEXT    NOT NULL,
    image_path     TEXT,
    status         TEXT    NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued', 'running', 'done', 'failed')),
    result         TEXT,
    error          TEXT,
    created        REAL    NOT NULL,
    started        REAL,
    finished       REAL,
    duration       REAL,
    parent_task_id INTEGER REFERENCES tasks(id),
    next_steps     TEXT    NOT NULL DEFAULT '[]',
    timeout_s      INTEGER NOT NULL DEFAULT 300,
    created_by     TEXT    NOT NULL DEFAULT 'user'
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, id);
CREATE INDEX IF NOT EXISTS idx_tasks_role ON tasks(role, status, finished);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
"""

# Columns sent to the board; full input and result only come with a single task.
SUMMARY_COLS = ("id, title, role, status, created, started, finished, duration, parent_task_id, "
                "next_steps, timeout_s, substr(error, 1, 160) AS error_preview")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _task(row):
    if row is None:
        return None
    task = dict(row)
    task["next_steps"] = json.loads(task["next_steps"] or "[]")
    return task


def init_db():
    """Create the table and fail any task left 'running' by a previous run. Returns those task ids."""
    now = time.time()
    with closing(connect()) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        rows = conn.execute(
            "UPDATE tasks SET status = 'failed', finished = ?, duration = ? - started, "
            "error = 'interrupted: the dashboard stopped while this task was running' "
            "WHERE status = 'running' RETURNING id", (now, now)).fetchall()
    return [r["id"] for r in rows]


def create_task(*, title, role, input, image_path=None, timeout_s=300, next_steps=(),
                parent_task_id=None, created_by="user"):
    with closing(connect()) as conn:
        cur = conn.execute(
            "INSERT INTO tasks (title, role, input, image_path, timeout_s, next_steps, parent_task_id, "
            "created_by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (title, role, input, image_path, timeout_s, json.dumps(list(next_steps)), parent_task_id,
             created_by, time.time()))
        return cur.lastrowid


def get_task(task_id):
    with closing(connect()) as conn:
        return _task(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())


def children(task_id):
    with closing(connect()) as conn:
        rows = conn.execute("SELECT id, title, role, status FROM tasks WHERE parent_task_id = ? ORDER BY id",
                            (task_id,)).fetchall()
    return [dict(r) for r in rows]


def board(limit_finished=30):
    """Tasks per status: all queued/running (oldest first), latest finished ones for done/failed."""
    out = {}
    with closing(connect()) as conn:
        for status in STATUSES:
            if status in ("queued", "running"):
                rows = conn.execute(f"SELECT {SUMMARY_COLS} FROM tasks WHERE status = ? ORDER BY id LIMIT 500",
                                    (status,)).fetchall()
            else:
                rows = conn.execute(f"SELECT {SUMMARY_COLS} FROM tasks WHERE status = ? "
                                    "ORDER BY finished DESC, id DESC LIMIT ?", (status, limit_finished)).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM tasks WHERE status = ?", (status,)).fetchone()[0]
            tasks = []
            for row in rows:
                task = dict(row)
                task["next_roles"] = [step["role"] for step in json.loads(task.pop("next_steps") or "[]")]
                tasks.append(task)
            out[status] = {"total": total, "tasks": tasks}
    return out


def claim_next(roles):
    """Atomically move the oldest queued task for these roles to 'running' and return it."""
    marks = ",".join("?" * len(roles))
    with closing(connect()) as conn:
        rows = conn.execute(
            f"UPDATE tasks SET status = 'running', started = ? WHERE status = 'queued' AND id = "
            f"(SELECT id FROM tasks WHERE status = 'queued' AND role IN ({marks}) ORDER BY id LIMIT 1) "
            "RETURNING *", (time.time(), *roles)).fetchall()
    return _task(rows[0]) if rows else None


def finish_task(task_id, status, result=None, error=None):
    now = time.time()
    with closing(connect()) as conn:
        rows = conn.execute(
            "UPDATE tasks SET status = ?, result = ?, error = ?, finished = ?, duration = ? - started "
            "WHERE id = ? AND status = 'running' RETURNING *",
            (status, result, error, now, now, task_id)).fetchall()
    return _task(rows[0]) if rows else None


def cancel_task(task_id):
    with closing(connect()) as conn:
        rows = conn.execute(
            "UPDATE tasks SET status = 'failed', error = 'cancelled by user before it started', finished = ? "
            "WHERE id = ? AND status = 'queued' RETURNING *", (time.time(), task_id)).fetchall()
    return _task(rows[0]) if rows else None


def role_status():
    out = []
    with closing(connect()) as conn:
        for role in ROLES:
            run = conn.execute("SELECT id, title, started FROM tasks WHERE role = ? AND status = 'running' "
                               "ORDER BY started LIMIT 1", (role,)).fetchone()
            last = conn.execute("SELECT id, duration, status FROM tasks WHERE role = ? AND status IN "
                                "('done', 'failed') AND started IS NOT NULL ORDER BY finished DESC LIMIT 1",
                                (role,)).fetchone()
            out.append({
                "role": role,
                "busy": run is not None,
                "task_id": run["id"] if run else None,
                "task_title": run["title"] if run else None,
                "started": run["started"] if run else None,
                "last_task_id": last["id"] if last else None,
                "last_duration_s": last["duration"] if last else None,
                "last_status": last["status"] if last else None,
            })
    return out
