I'm continuing work on my local LLM stack on this Windows 11 PC. Read C:\Vault\CLAUDE.md first, then use this summary to pick up where we left off. Don't redo finished work; check the current state before changing anything.

## How I want you to work
- Show me each command before running anything that installs software, changes system settings, creates scheduled tasks or auto-start entries, or touches the firewall. Wait for my approval.
- Show me the plan and file list before writing larger features.
- Stop and tell me if anything fails. Report test results honestly, including partial passes.
- Never read, list, or write anything in C:\Vault\private. Never put secrets in the vault; the LiteLLM key lives only in C:\agents\.env.
- Treat planner and coder output as drafts. Only I or claude-code assign roles to tasks.
- Don't create auto-start tasks yourself. Give me the command and I'll run it.

## What's running
- Ollama on this PC (RTX 4060 Ti, 8 GB), port 11434, starts at login. Env vars: OLLAMA_HOST=0.0.0.0, OLLAMA_MAX_LOADED_MODELS=1, OLLAMA_KEEP_ALIVE=10m. Models: qwen2.5-coder:7b, qwen3:8b (both 100% GPU).
- Second Ollama server (CPU laptop) at 192.168.x.x:11434 with qwen3-vl:4b, memory-cpu, trimmer-cpu.
- LiteLLM proxy on 127.0.0.1:4000, master key in C:\agents\.env, config C:\agents\config.yaml. Started at login by scheduled task "LiteLLM Proxy" (runs C:\agents\start_proxy.ps1 hidden, logs to C:\agents\litellm.log).
- Night City Office dashboard on 127.0.0.1:8080: FastAPI + SQLite in C:\agents\dashboard, started by hand with C:\agents\start_dashboard.ps1 (no auto-start task yet).

## Roles (LiteLLM model names)
| Role | Character | Model | Runs on |
|---|---|---|---|
| claude-code | David Martinez | Claude | cloud |
| coder | Lucy | qwen2.5-coder:7b | PC GPU |
| planner | Maine | qwen3:8b | PC GPU |
| vision | Rebecca | qwen3-vl:4b | laptop |
| memory | Kiwi | memory-cpu | laptop |
| trimmer | Falco | trimmer-cpu | laptop |
| hermes | (empty server rack) | not configured | — |

## Key files
- C:\agents\local_llm.py: `python local_llm.py <role> [--image PATH] [--skill NAME]x2 [--think|--no-think] [--no-system] [--show-thinking] [--timeout N] "<task>"` (or `-` to read the task from stdin).
  - Loads C:\Vault\prompts\<role>.md as the system prompt.
  - --skill appends C:\Vault\prompts\skills\<name>.md (max 2) and drops the role prompt's "Output format" block so the skill's format wins.
  - vision defaults to think=false.
- C:\Vault\prompts\: coder, planner, vision, memory, trimmer system prompts (under 15 lines each).
- C:\Vault\prompts\skills\: distilled skills, 15 lines max.
  - coder: ponytail, code-review, debug, testing-strategy
  - memory: knowledge-base, obsidian-vault, stop-slop
  - vision: design-critique, accessibility-review
- C:\Vault\skills\: 7 Claude Code skills (roblox-luau, blender-workflow, figma-to-code, minecraft-addon, web-build, task-handoff, vault-notes). Copied to C:\Users\<you>\.claude\skills; re-copy after editing with:
  `Copy-Item -Path 'C:\Vault\skills\*' -Destination "$env:USERPROFILE\.claude\skills" -Recurse -Force`
- Dashboard: C:\agents\dashboard\ (app.py, db.py, worker.py, static\index.html, office.js, board.js, style.css, fonts\VT323 with its OFL licence).
  - Two worker lanes: PC (coder, planner) and laptop (vision, memory, trimmer), one task at a time each.
  - Chains of up to 3 follow-up steps; hand off, retry, and cancel.
  - Results saved to C:\Vault\tasks\task-<id>.md.
  - Local-only checks: Host header, Origin, JSON-only writes, CSP 'self'.

## Known issues
- trimmer sometimes drops key details (it cut "takes the coins" from a bug report).
- memory sometimes adds words that weren't in the input.
- coder at the end of a chain often replies "Missing context:" instead of code.
- planner sometimes lists more than 2 risks.
- ponytail's "Skipped:" line is unreliable (vague, or contradicts the code).
- LiteLLM returns 500/400 instead of 401 for a bad or missing key (missing prisma module); requests are still refused.
- Firewall: I was given the command for TCP 11434 on the Private profile and for disabling the old ollama.exe rules that also allowed Public. Check whether I ran it: `Get-NetFirewallRule -DisplayName 'Ollama*','ollama.exe' | Select DisplayName, Enabled, Profile`.

## Open ideas, not started
- A skill picker in the dashboard form (dashboard tasks can't use --skill yet).
- Shorter titles for chained tasks.
- Cancel for running tasks.
- Configure hermes.
- Auto-start task for the dashboard (I run the command myself).

## First steps when we resume
1. Check what's up: `Get-NetTCPConnection -LocalPort 11434,4000,8080 -State Listen`, and whether 192.168.x.x:11434 responds.
2. If the dashboard isn't running, tell me and I'll start it.
3. Then ask me what I want to work on next.
