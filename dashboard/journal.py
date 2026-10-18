"""The crew's Obsidian journal: per-project retros, a daily note, per-agent lessons files, research notes.
Lessons files (C:\\Vault\\agents\\<role>.md) are read back into the lead's plan and the agents' prompts.
"""
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

VAULT = Path(r"C:\Vault")
JOURNAL, AGENTS, RESEARCH, TEMPLATES = VAULT / "journal", VAULT / "agents", VAULT / "research", VAULT / "templates"
MODELS = {"coder": "qwen3:8b", "planner": "qwen3:8b", "vision": "qwen3-vl:4b", "memory": "llama3.2:3b",
          "trimmer": "qwen3:1.7b", "lead": "claude code"}
MAX_LESSONS, LESSON_CHARS, BLOCK_CHARS = 12, 220, 1200


def _write(path, text):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    except OSError as e:
        print(f"warning: journal write failed for {path}: {e}", file=sys.stderr)


def _lesson_lines(role):
    try:
        text = (AGENTS / f"{role}.md").read_text(encoding="utf-8")
    except OSError:
        return []
    return [l[2:].strip() for l in text.splitlines() if l.startswith("- ") and l[2:].strip()]


def lessons_block(role):
    """Text put in front of an agent's task: its own past lessons, newest last."""
    lines = _lesson_lines(role)
    block = "\n".join(f"- {l}" for l in lines)
    return f"Lessons from your past work (follow them):\n{block[-BLOCK_CHARS:]}\n\n" if lines else ""


def all_lessons():
    """Every agent's lessons, for the lead's plan prompt."""
    parts = [f"{role}: " + " | ".join(lines) for role in MODELS if (lines := _lesson_lines(role))]
    return "\n".join(parts)[:3500]


def add_lessons(role, items):
    if role not in MODELS:
        return
    lines = _lesson_lines(role)
    seen = {l.casefold() for l in lines}
    for item in items or []:
        item = " ".join(str(item).split())[:LESSON_CHARS]
        if item and item.casefold() not in seen:
            lines.append(item)
            seen.add(item.casefold())
    lines = lines[-MAX_LESSONS:]
    head = (f"---\ntags: [agent, lessons]\nrole: {role}\nmodel: {MODELS[role]}\n---\n# {role}: lessons\n"
            "Written by the lead after each project. Edit freely: the crew reads the bullet lines below.\n\n")
    _write(AGENTS / f"{role}.md", head + "\n".join(f"- {l}" for l in lines) + "\n")


def save_research(pid, title, text):
    path = RESEARCH / f"lead-{pid}.md"
    _write(path, f"---\ntags: [research]\nproject: {pid}\ndate: {datetime.now():%Y-%m-%d}\n---\n# Research: {title}\n\n{text}\n")
    return path


def write_retro(pid, title, summary, meets, retros, task_ids, stats):
    """One retro note per project with a section per agent, linked to the task notes and the report."""
    lines = ["---", "tags: [agent-journal, retro]", f"project: {pid}", f"date: {datetime.now():%Y-%m-%d}",
             f"meets_intent: {meets}", "---", f"# Retro: {title}", "",
             f"Report: [[lead-{pid}]]. Tasks: " + " ".join(f"[[task-{i}]]" for i in task_ids), "",
             f"Checks: {stats}", "", "## What the lead thinks", summary or "", ""]
    for role, r in (retros or {}).items():
        if role not in MODELS or not isinstance(r, dict):
            continue
        lines += [f"## {role} ({MODELS[role]})"]
        for key, label in (("did", "Did"), ("how", "How"), ("good", "Went well"), ("bad", "Went badly"), ("improve", "Improve")):
            if r.get(key):
                lines.append(f"- **{label}:** {r[key]}")
        lines.append("")
    _write(JOURNAL / f"lead-{pid}-retro.md", "\n".join(lines) + "\n")
    daily(f"[[lead-{pid}-retro]] {title}: intent met = {meets}. {stats}")


def daily(line):
    path = JOURNAL / f"{datetime.now():%Y-%m-%d}.md"
    try:
        existing = path.read_text(encoding="utf-8")
    except OSError:
        existing = f"---\ntags: [agent-journal, daily]\n---\n# {datetime.now():%Y-%m-%d}\n\n"
    _write(path, existing.rstrip("\n") + f"\n- {datetime.now():%H:%M} {line}\n")


def add_verdict(pid, title, ok, note):
    """The user's own verdict on a finished project: goes in the daily note and the lead's lessons."""
    word = "GOOD" if ok else "NEEDS WORK"
    daily(f"You rated [[lead-{pid}-retro]] {title}: {word}" + (f" ({note})" if note else ""))
    if note or not ok:
        add_lessons("lead", [f"User rated '{title[:40]}' {word}" + (f": {note}" if note else "")])


def save_template(pid, title, idea, spec, plan):
    """A project the user rated GOOD becomes a template the lead can reuse. You can also write your own in C:\\Vault\\templates."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or f"project-{pid}"
    text = (f"---\ntags: [template]\ntitle: {title}\nsource_project: {pid}\n---\n# Template: {title}\n\n"
            f"Idea it solved: {idea}\n\n## Spec\n{spec or ''}\n\n## Tasks\n```json\n{json.dumps(plan, indent=1)}\n```\n")
    _write(TEMPLATES / f"{pid}-{slug}.md", text)


_WORD = re.compile(r"[a-z0-9]{4,}")


def find_templates(idea, k=2):
    """(prompt text, names) for up to k saved templates sharing at least 2 words with the idea."""
    want = set(_WORD.findall(idea.lower()))
    scored = []
    try:
        files = list(TEMPLATES.glob("*.md"))
    except OSError:
        files = []
    for f in files:
        try:
            text = f.read_text(encoding="utf-8")
        except OSError:
            continue
        score = len(want & set(_WORD.findall(text.lower().split("## tasks")[0])))
        if score >= 2:
            scored.append((score, f.stat().st_mtime, text))
    parts, names = [], []
    for _, _, text in sorted(scored, reverse=True)[:k]:
        title = (re.search(r"^title: (.+)$", text, re.M) or [None, "template"])[1]
        m = re.search(r"```json\n(.*?)```", text, re.S)
        try:
            tasks = [{k2: (str(t.get(k2, ""))[:400]) for k2 in ("role", "title", "prompt", "accept")} for t in json.loads(m.group(1))]
        except (AttributeError, ValueError):
            continue
        parts.append(f"### {title}\n" + json.dumps(tasks)[:1800])
        names.append(title)
    return "\n\n".join(parts), names
