"""Checks the crew runs on its own work before the lead sees it: self-check, a different model's review, and a
syntax check of any code. Prompts start with worker.NOSYS so the role's own output-format prompt doesn't fight them.
"""
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .worker import NOSYS

MAX_REVISIONS = 2
SELF_CHECK_ROLES = {"coder", "planner", "vision"}  # the 1.7B and 3B models just make a short reply worse when asked to redo it
REVIEWER = {"coder": "planner", "planner": "coder", "vision": "planner", "memory": "planner", "trimmer": "planner"}
NODE = shutil.which("node")
FENCE = re.compile(r"```[ \t]*([\w+-]*)[ \t]*\n(.*?)```", re.S)


def selfcheck_prompt(task, answer):
    return (f"{NOSYS}Check your own work. Here is the task and your answer.\n\nTASK:\n{task}\n\nYOUR ANSWER:\n{answer}\n\n"
            "Go through the task point by point. Look for: something asked for but missing, invented functions or facts, "
            "wrong format, mistakes. If you find problems, output the complete corrected answer. If it is already right, "
            "output the same answer. Output only the final answer in the same format, with no commentary about this check.")


def peer_prompt(task, accept, answer):
    return (f"{NOSYS}You are a strict reviewer on a small team. Check a colleague's work.\n\nTASK THEY WERE GIVEN:\n{task}\n\n"
            f"HOW TO TELL IT IS RIGHT:\n{accept or 'It does exactly what the task asks, in the requested format.'}\n\n"
            f"THEIR WORK:\n{answer}\n\n"
            "Check: does it do exactly what the task asks, is the format right, does it invent anything (functions, libraries, "
            "facts), does it leave anything out?\n"
            "Reply format: the first line is exactly PASS or FAIL. If FAIL, then at most 5 lines, each one problem and how to fix it. "
            "No other text.")


def revise_prompt(task_input, answer, problems):
    probs = "\n".join(f"- {p}" for p in problems)
    return (f"{task_input}\n\n---\nYour previous answer had problems found by a reviewer:\n{probs}\n\n"
            f"Your previous answer:\n{answer}\n\nFix every problem. Output the complete corrected answer in the format the task asks for.")


def parse_peer(text):
    """(passed, problems). A reply that is neither PASS nor FAIL counts as a pass so a confused reviewer never blocks work."""
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if not lines:
        return True, []
    first = lines[0].upper().lstrip("*#> ").rstrip(".:*")
    if first.startswith("FAIL"):
        probs = [re.sub(r"^[-*\d.\s)]+", "", l) for l in lines[1:6]]
        return False, [p for p in probs if p] or ["reviewer said FAIL without details"]
    return True, []


def keep_fix(original, fixed):
    """Use the self-checked answer unless it came back empty, asks for context, or shrank to a fragment."""
    fixed = (fixed or "").strip()
    if not fixed or fixed.lower().startswith("missing context"):
        return False
    return not (len(original) > 200 and len(fixed) < 0.5 * len(original))


def code_problems(text):
    """(blocks checked, problems). Syntax only: model code is never run."""
    checked, problems = 0, []
    for lang, body in FENCE.findall(text):
        lang = lang.lower()
        if lang in ("py", "python"):
            checked += 1
            try:
                compile(body, "<code>", "exec")
            except SyntaxError as e:
                problems.append(f"Python syntax error on line {e.lineno}: {e.msg}")
        elif lang == "json":
            checked += 1
            try:
                json.loads(body)
            except ValueError as e:
                problems.append(f"JSON does not parse: {e}")
        elif lang in ("js", "javascript") and NODE:
            checked += 1
            with tempfile.TemporaryDirectory() as d:
                f = Path(d) / "c.mjs"
                f.write_text(body, encoding="utf-8")
                r = subprocess.run([NODE, "--check", str(f)], capture_output=True, text=True, timeout=20,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                if r.returncode:
                    problems.append("JavaScript syntax error: " + (r.stderr.strip().splitlines() or ["?"])[-1][:200])
    return checked, problems


if __name__ == "__main__":
    assert parse_peer("PASS")[0] and not parse_peer("FAIL\n- uses fake_api()")[0]
    assert parse_peer("**FAIL**\n1. missing X")[1] == ["missing X"]
    assert parse_peer("hmm unsure")[0]
    assert code_problems("```python\nx = (\n```")[1] and not code_problems("```python\nx = 1\n```")[1]
    assert not keep_fix("a" * 300, "short") and keep_fix("a" * 300, "b" * 300)
    print("quality ok")
