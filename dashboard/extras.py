"""Stats, vault notes and per-role skills for the dashboard. Read-only on the vault except skills.json."""
import json
import os
import re
import time
from contextlib import closing
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import db

VAULT = Path(r"C:\Vault")
SKILLS_DIR = VAULT / "skills"
SKILLS_FILE = VAULT / "assets" / "office" / "skills.json"
HIDDEN = {"private", ".obsidian", "assets", ".git"}  # never listed or read
SKILL_CAP = 3000  # characters of one SKILL.md put in front of a task: the local models are small
START = time.time()
router = APIRouter()


def stats():
    now = time.time()
    with closing(db.connect()) as conn:
        by_status = {s: conn.execute("SELECT COUNT(*) FROM tasks WHERE status = ?", (s,)).fetchone()[0] for s in db.STATUSES}
        roles = {}
        for role in db.ROLES:
            r = conn.execute("SELECT SUM(status = 'done'), SUM(status = 'failed'), AVG(CASE WHEN status = 'done' THEN duration END) "
                             "FROM tasks WHERE role = ? AND status IN ('done', 'failed')", (role,)).fetchone()
            roles[role] = {"done": r[0] or 0, "failed": r[1] or 0, "avg_s": r[2]}
        buckets = [0] * 12  # finished tasks per 5 minutes, oldest first
        for (fin,) in conn.execute("SELECT finished FROM tasks WHERE finished IS NOT NULL AND finished > ?", (now - 3600,)):
            buckets[min(11, int((fin - (now - 3600)) // 300))] += 1
        day = conn.execute("SELECT COUNT(*) FROM tasks WHERE finished > ?", (now - 86400,)).fetchone()[0]
        avg = conn.execute("SELECT AVG(duration) FROM tasks WHERE status = 'done' AND duration IS NOT NULL").fetchone()[0]
    finished = by_status["done"] + by_status["failed"]
    return {"by_status": by_status, "roles": roles, "per_5min": buckets, "last_24h": day, "avg_s": avg,
            "success": by_status["done"] / finished if finished else None, "uptime_s": now - START, "server_time": now}


@router.get("/api/stats")
def get_stats():
    return stats()


def _visible(path):
    rel = path.relative_to(VAULT)
    return not (set(rel.parts) & HIDDEN) and path.suffix == ".md"


def _note(path):
    try:
        head = path.read_text(encoding="utf-8", errors="replace")[:600]
    except OSError:
        return None
    fm = re.match(r"---\r?\n(.*?)\r?\n---\r?\n", head, re.S)
    meta = fm.group(1) if fm else ""
    text = head[fm.end():] if fm else head
    t = re.search(r"^title:\s*\"?(.+?)\"?\s*$", meta, re.M)
    title = t.group(1) if t else next((ln.lstrip("# ").strip() for ln in text.splitlines() if ln.startswith("# ")), path.stem)
    body = " ".join(ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith(("#", "---", "- **")))
    return {"path": path.relative_to(VAULT).as_posix(), "title": title, "mtime": path.stat().st_mtime, "snippet": body[:140]}


@router.get("/api/vault")
def vault():
    if not VAULT.is_dir():
        return {"notes": []}
    files = []
    for root, dirs, names in os.walk(VAULT):
        dirs[:] = [d for d in dirs if d not in HIDDEN]
        files += [Path(root) / n for n in names if n.endswith(".md")]
    files = sorted((f for f in files if _visible(f)), key=lambda f: f.stat().st_mtime, reverse=True)[:40]
    return {"notes": [n for n in map(_note, files) if n]}


@router.get("/api/vault/note")
def vault_note(path: str):
    target = (VAULT / path).resolve()
    if VAULT.resolve() not in target.parents or not target.is_file() or not _visible(target):
        raise HTTPException(404, "no such note")
    return {"path": path, "text": target.read_text(encoding="utf-8", errors="replace")[:20000]}


def _skill_info(folder):
    text = ""
    try:
        text = (folder / "SKILL.md").read_text(encoding="utf-8", errors="replace")
    except OSError:
        pass
    m = re.search(r"^description:\s*(.+)$", text, re.M)
    first = next((ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith(("#", "---", "name:"))), "")
    return {"name": folder.name, "description": (m.group(1) if m else first)[:160], "has_file": bool(text)}


def skill_list():
    return [_skill_info(d) for d in sorted(SKILLS_DIR.iterdir()) if d.is_dir()] if SKILLS_DIR.is_dir() else []


def assigned():
    try:
        data = json.loads(SKILLS_FILE.read_text(encoding="utf-8"))
        return {r: [s for s in data.get(r, []) if isinstance(s, str)] for r in db.ROLES}
    except (OSError, ValueError, AttributeError):
        return {r: [] for r in db.ROLES}


def skill_prefix(role):
    """Text put in front of a task's input for the skills switched on for this role (empty when none)."""
    parts = []
    for name in assigned().get(role, []):
        f = SKILLS_DIR / name / "SKILL.md"
        try:
            if SKILLS_DIR.resolve() in f.resolve().parents and f.is_file():
                parts.append(f"## Skill: {name}\n" + f.read_text(encoding="utf-8", errors="replace")[:SKILL_CAP])
        except OSError:
            continue
    return ("Use these skills when relevant:\n\n" + "\n\n".join(parts) + "\n\n---\n\n") if parts else ""


class SkillsIn(BaseModel):
    role: str
    skills: list[str] = Field(max_length=20)


@router.get("/api/skills")
def get_skills():
    return {"skills": skill_list(), "assigned": assigned()}


@router.post("/api/skills")
def set_skills(body: SkillsIn):
    if body.role not in db.ROLES:
        raise HTTPException(422, "unknown role")
    known = {s["name"] for s in skill_list()}
    if any(s not in known for s in body.skills):
        raise HTTPException(422, "unknown skill")
    data = assigned()
    data[body.role] = sorted(set(body.skills))
    tmp = SKILLS_FILE.with_name(SKILLS_FILE.name + ".tmp")
    try:
        SKILLS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, SKILLS_FILE)
    except OSError as e:
        raise HTTPException(500, f"could not save skills: {e}")
    return {"assigned": data}
