"""Background workers that run queued tasks through local_llm.py.

Two lanes, each running one task at a time:
  pc     - coder, planner (they share this PC's GPU)
  laptop - vision, memory, trimmer (the Ollama server at 192.168.x.x)
The lanes run independently, so one PC task and one laptop task can run together.
"""
import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path

from . import db, extras

AGENTS_DIR = Path(__file__).resolve().parent.parent
LOCAL_LLM = AGENTS_DIR / "local_llm.py"
VAULT_TASKS = Path(r"C:\Vault\tasks")
PRIVATE_DIR = Path(r"C:\Vault\private")

LANES = {"pc": ("coder", "planner"), "laptop": ("vision", "memory", "trimmer")}
LANE_OF = {role: lane for lane, roles in LANES.items() for role in roles}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
KILL_GRACE_S = 5  # local_llm.py gets the task timeout itself; the process is killed this much later
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
# A task whose input starts with this line runs without the role's system prompt or skills (used for reviews).
NOSYS = "<<no-system>>\n"


def _under_private(path):
    private = Path(os.path.normcase(os.path.abspath(PRIVATE_DIR)))
    candidate = Path(os.path.normcase(os.path.abspath(path)))
    return candidate == private or private in candidate.parents


def check_image_path(raw):
    """Validate an image path for the vision role. Never touches anything under C:\\Vault\\private."""
    path = Path(raw.strip().strip('"'))
    if not path.is_absolute():
        raise ValueError(r"use a full path, e.g. C:\agents\test.png")
    # Check the path as written before resolving it, so a private path is never opened, then again after
    # resolving, so a link or junction can't point into private either.
    if _under_private(path):
        raise ValueError(r"images under C:\Vault\private are not allowed")
    resolved = path.resolve()
    if _under_private(resolved):
        raise ValueError(r"images under C:\Vault\private are not allowed")
    if resolved.suffix.lower() not in IMAGE_SUFFIXES:
        raise ValueError(f"not an image file (allowed: {', '.join(sorted(IMAGE_SUFFIXES))})")
    if not resolved.is_file():
        raise ValueError(f"image not found: {resolved}")
    return str(resolved)


def follow_up_input(instruction, result):
    instruction = (instruction or "").strip()
    return f"{instruction}\n\n{result}" if instruction else result


def spawn_follow_up(parent, step, rest, timeout_s=None):
    """Queue a task for step['role'] whose input is the parent's result (after the optional instruction)."""
    return db.create_task(
        title=f"{parent['title']} → {step['role']}"[:200],
        role=step["role"],
        input=follow_up_input(step.get("instruction"), parent["result"]),
        timeout_s=timeout_s or parent["timeout_s"],
        next_steps=rest,
        parent_task_id=parent["id"],
        created_by=parent["role"],
    )


def _ts(ts):
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S") if ts else ""


def write_note(task):
    """Save a finished task to C:\\Vault\\tasks\\task-<id>.md in the task-handoff format."""
    duration = f"{task['duration']:.1f}" if task["duration"] is not None else ""
    lines = [
        "---",
        f"id: {task['id']}",
        f"title: {json.dumps(task['title'], ensure_ascii=False)}",
        f"from: {task['created_by']}",
        f"to: {task['role']}",
        f"status: {task['status']}",
        f"parent: {task['parent_task_id'] or ''}",
        f"created: {_ts(task['created'])}",
        f"started: {_ts(task['started'])}",
        f"finished: {_ts(task['finished'])}",
        f"duration_s: {duration}",
        "---",
        "",
        "## Goal",
        task["title"],
        "",
        "## Input",
        task["input"],
    ]
    if task["image_path"]:
        lines += ["", "## Image", task["image_path"]]
    if task["status"] == "done":
        lines += ["", "## Result", task["result"] or ""]
    else:
        lines += ["", "## Result", "_Failed: see Error._", "", "## Error", task["error"] or ""]
    if task["next_steps"]:
        lines += ["", "## Next steps"] + [f"- {s['role']}: {s.get('instruction') or '(no instruction)'}"
                                          for s in task["next_steps"]]
    try:
        VAULT_TASKS.mkdir(parents=True, exist_ok=True)
        (VAULT_TASKS / f"task-{task['id']}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError as e:
        print(f"warning: could not write vault note for task {task['id']}: {e}", file=sys.stderr)


class Workers:
    def __init__(self):
        self.stop = threading.Event()
        self.threads = []
        self.procs = {}
        self.lock = threading.Lock()

    def start(self):
        for lane, roles in LANES.items():
            thread = threading.Thread(target=self._loop, args=(lane, roles), name=f"lane-{lane}", daemon=True)
            thread.start()
            self.threads.append(thread)

    def shutdown(self):
        """Stop the lanes and kill running tasks; the next start marks those tasks failed."""
        self.stop.set()
        with self.lock:
            procs = list(self.procs.values())
        for proc in procs:
            proc.kill()
        for thread in self.threads:
            thread.join(timeout=10)

    def _loop(self, lane, roles):
        while not self.stop.is_set():
            try:
                task = db.claim_next(roles)
                if task is None:
                    self.stop.wait(1.0)
                    continue
                self._run(lane, task)
            except Exception as e:  # keep the lane alive; the error is visible in the log
                print(f"lane {lane}: {type(e).__name__}: {e}", file=sys.stderr)
                self.stop.wait(2.0)

    def _run(self, lane, task):
        cmd = [sys.executable, str(LOCAL_LLM), "--timeout", str(task["timeout_s"])]
        if task["image_path"]:
            cmd += ["--image", task["image_path"]]
        nosys = task["input"].startswith(NOSYS)
        text = task["input"][len(NOSYS):] if nosys else task["input"]
        if nosys:
            cmd.append("--no-system")
        cmd += [task["role"], "-"]
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True, encoding="utf-8", errors="replace", cwd=AGENTS_DIR,
                                    env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                                    creationflags=CREATE_NO_WINDOW)
        except OSError as e:
            self._finish(task, "failed", error=f"could not start local_llm.py: {e}")
            return
        with self.lock:
            self.procs[lane] = proc
        try:
            out, err = proc.communicate(("" if nosys else extras.skill_prefix(task["role"])) + text, timeout=task["timeout_s"] + KILL_GRACE_S)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            self._finish(task, "failed", error=f"timed out after {task['timeout_s']} s (process killed)")
            return
        finally:
            with self.lock:
                self.procs.pop(lane, None)
        if self.stop.is_set() and proc.returncode != 0:
            return  # killed by shutdown
        if proc.returncode == 0 and out.strip():
            self._finish(task, "done", result=out.strip())
        else:
            error = (err or "").strip() or f"local_llm.py exited with code {proc.returncode} and no reply"
            self._finish(task, "failed", error=error[-4000:])

    def _finish(self, task, status, result=None, error=None):
        finished = db.finish_task(task["id"], status, result, error)
        if finished is None:
            return
        write_note(finished)
        if status == "done" and finished["next_steps"]:
            first, *rest = finished["next_steps"]
            spawn_follow_up(finished, first, rest)
