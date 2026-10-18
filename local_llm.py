r"""Send a task to a local model via the LiteLLM proxy and print the reply.

Usage:
    python local_llm.py <role> <task...>
    python local_llm.py coder "write a python function that reverses a string"
    echo "long task text" | python local_llm.py planner -
    python local_llm.py vision --image screenshot.png "What is on this screen?"

Roles are the model_name entries in config.yaml (coder, planner, vision, memory, trimmer).
If C:\Vault\prompts\<role>.md exists it is sent as the system prompt (skip with --no-system).
--skill <name> (up to 2) appends C:\Vault\prompts\skills\<name>.md after it, e.g. coder --skill ponytail.
The proxy key is read from LITELLM_MASTER_KEY in the environment, or from .env next to this script.
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROXY_URL = os.environ.get("LITELLM_URL", "http://127.0.0.1:4000")
ENV_FILE = Path(__file__).resolve().parent / ".env"
# Roles whose model reasons too long by default; they get think=false unless --think is passed.
NO_THINK_ROLES = {"vision", "coder"}  # coder is qwen3:8b now; without this it reasons for minutes before coding
# System prompts live here as <role>.md; a role without a file gets no system prompt.
PROMPTS_DIR = Path(os.environ.get("LOCAL_LLM_PROMPTS", r"C:\Vault\prompts"))
# Distilled skills (<name>.md) that --skill appends to the system prompt; small models get at most this many.
SKILLS_DIR = PROMPTS_DIR / "skills"
MAX_SKILLS = 2
NAME_RE = r"[a-z0-9][a-z0-9_-]*"


def load_key():
    key = os.environ.get("LITELLM_MASTER_KEY")
    if key:
        return key
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.partition("=")
            if sep and name.strip() == "LITELLM_MASTER_KEY":
                return value.strip().strip('"').strip("'")
    sys.exit(f"error: LITELLM_MASTER_KEY not set and not found in {ENV_FILE}")


def load_system_prompt(role):
    # Plain role names only, so a role like "..\private\x" can't read files outside PROMPTS_DIR.
    if not re.fullmatch(NAME_RE, role):
        return None
    file = PROMPTS_DIR / f"{role}.md"
    if not file.is_file():
        return None
    text = file.read_text(encoding="utf-8").strip()
    return text or None


def strip_output_format(prompt):
    """Drop the role prompt's "Output format" block (that line up to the next blank line) so a skill's format wins."""
    kept, skipping = [], False
    for line in prompt.splitlines():
        if re.match(r"\s*output format\b", line, re.IGNORECASE):
            skipping = True
            continue
        if skipping and not line.strip():
            skipping = False
        if not skipping:
            kept.append(line)
    return "\n".join(kept).strip()


def load_skills(names):
    """Read prompts\\skills\\<name>.md for each requested skill, refusing bad names, unknown skills, or too many."""
    names = list(dict.fromkeys(names))  # drop repeats, keep order
    if len(names) > MAX_SKILLS:
        sys.exit(f"error: at most {MAX_SKILLS} --skill per call (got {len(names)}: {', '.join(names)})")
    available = sorted(p.stem for p in SKILLS_DIR.glob("*.md")) if SKILLS_DIR.is_dir() else []
    texts = []
    for name in names:
        file = SKILLS_DIR / f"{name}.md"
        if not re.fullmatch(NAME_RE, name) or not file.is_file():
            sys.exit(f"error: unknown skill '{name}'. Available: {', '.join(available) or 'none'}")
        texts.append(file.read_text(encoding="utf-8").strip())
    return texts


def image_part(path):
    """Return an OpenAI-style image_url content part with the file inlined as a base64 data URL."""
    file = Path(path)
    if not file.is_file():
        sys.exit(f"error: image not found: {file}")
    mime = mimetypes.guess_type(file.name)[0]
    if not mime or not mime.startswith("image/"):
        sys.exit(f"error: not a recognised image type: {file}")
    data = base64.b64encode(file.read_bytes()).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}


def main():
    parser = argparse.ArgumentParser(description="Ask a local LLM role a task via LiteLLM.")
    parser.add_argument("role", help="model role from config.yaml, e.g. coder or planner")
    parser.add_argument("task", nargs="+", help="task text, or - to read it from stdin")
    parser.add_argument("--show-thinking", action="store_true", help="also print the model's reasoning, if any")
    parser.add_argument("--timeout", type=int, default=300, help="request timeout in seconds (default 300)")
    parser.add_argument("--image", action="append", default=[], metavar="PATH",
                        help="attach an image file (repeat for several); use with a vision-capable role")
    thinking = parser.add_mutually_exclusive_group()
    thinking.add_argument("--no-think", action="store_true",
                          help="ask the model to skip/shorten its reasoning (Ollama think=false); faster on qwen3 models")
    thinking.add_argument("--think", action="store_true",
                          help=f"let the model reason normally; roles in {sorted(NO_THINK_ROLES)} default to --no-think")
    parser.add_argument("--no-system", action="store_true",
                        help=f"don't send the role's system prompt from {PROMPTS_DIR}\\<role>.md")
    parser.add_argument("--skill", action="append", default=[], metavar="NAME",
                        help=f"append {SKILLS_DIR}\\<NAME>.md to the system prompt (repeat, at most {MAX_SKILLS})")
    args = parser.parse_args()
    if args.no_system and args.skill:
        parser.error("--skill can't be combined with --no-system")
    skills = load_skills(args.skill)

    task = sys.stdin.read() if args.task == ["-"] else " ".join(args.task)
    if not task.strip():
        sys.exit("error: empty task")

    content = task
    if args.image:
        content = [{"type": "text", "text": task}] + [image_part(p) for p in args.image]

    messages = [{"role": "user", "content": content}]
    system_prompt = None if args.no_system else load_system_prompt(args.role)
    if skills:
        parts = [strip_output_format(system_prompt)] if system_prompt else []
        parts.append("Apply the skills below. If a skill gives an output format, use that format.")
        system_prompt = "\n\n".join(parts + skills)
    if system_prompt:
        messages.insert(0, {"role": "system", "content": system_prompt})

    payload = {"model": args.role, "messages": messages}
    if args.no_think or (args.role in NO_THINK_ROLES and not args.think):
        payload["think"] = False
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{PROXY_URL}/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {load_key()}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=args.timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"error: proxy returned HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}")
    except TimeoutError:
        sys.exit(f"error: timed out after {args.timeout} s waiting for the {args.role} model")
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            sys.exit(f"error: timed out after {args.timeout} s waiting for the {args.role} model")
        sys.exit(f"error: cannot reach LiteLLM at {PROXY_URL} ({e.reason}). Is start_proxy.ps1 running?")

    message = data["choices"][0]["message"]
    if args.show_thinking and message.get("reasoning_content"):
        print("--- thinking ---\n" + message["reasoning_content"].strip() + "\n--- reply ---")
    print((message.get("content") or "").strip())


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
