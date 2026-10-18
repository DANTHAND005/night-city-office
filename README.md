# Night City Office

A local dashboard where a Claude "lead" plans and reviews work for a crew of local AI models, then applies the accepted work into Roblox Studio, Blender and Figma. It was built to make the Roblox game **Re:islands** (an "Islands" remake). The dashboard is the tooling; the game lives in Roblox Studio.

Everything runs on one Windows PC (plus a laptop for two models). Nothing is hosted.

## What is in this repo

| Path | What it is |
|---|---|
| `dashboard/` | The FastAPI app (backend and static front end) |
| `dashboard/lead.py` | The lead pipeline: research, plan, questions, crew tasks, peer review, code check, revisions, lead review, retries, apply step |
| `dashboard/apply.py` | The Apply step: readiness gate, tool allowlists, apply plan, backups rule |
| `dashboard/autopilot.py` | Autopilot loop and the timestamped changes log |
| `dashboard/research.py` | Research tab: links, notes, reference images, standards digest |
| `dashboard/backlog.py`, `worker.py`, `extras.py`, `quality.py`, `journal.py`, `mcp_status.py`, `db.py`, `app.py` | Task board, workers, free-time jobs, quality checks, the vault journal, MCP status, SQLite, app wiring |
| `dashboard/static/` | The UI: 3D office room (three.js, vendored), board, lead panel, drawers (Free time, Research, Changes), styles, VT323 font |
| `dashboard/static_backup*/` | Older copies of the UI kept as history |
| `desktop_app.py` | Desktop window that launches the server and the proxy |
| `local_llm.py` | Helper for calling the local models |
| `start_dashboard.ps1`, `start_proxy.ps1`, `roblox_mcp.cmd` | Start scripts |
| `lead_mcp.json`, `empty_mcp.json` | MCP servers the lead is allowed to use (Roblox Studio, Blender, Figma) |
| `config.example.yaml` | LiteLLM model routing, with the key removed |
| `PRODUCT.md`, `.impeccable/` | Product notes and the design mockups for the office UI |
| `tools/three-vendor/` | Script that copies the three.js files into the static folder |
| `docs/vault/` | Roadmap, the security and architecture standard, audit report |
| `docs/history/` | Every lead project (idea, spec, summary, apply report, notes) and the timestamped changes log, exported from the database |
| `docs/build-prompts/` | The prompts used to build Re:islands directly in Studio and Figma |

## Architecture

- **Server:** FastAPI on `127.0.0.1:8080`, started by `desktop_app.py` with `uvicorn dashboard.app:app`. Host must be `127.0.0.1:8080` or `localhost:8080`. POST requests need an `Origin` of `http://127.0.0.1:8080` and a JSON content type. CSP is `script-src 'self'`. Static files are served from disk; backend changes need a restart (no `--reload`).
- **Models:** a LiteLLM proxy on port 4000 routes four named models to Ollama: `coder` and `planner` (qwen3:8b on the PC), `vision` (qwen3-vl:4b), `memory` and `trimmer` (on the laptop). See `config.example.yaml`.
- **Lead:** headless `claude -p`. "Hard" work (research, review, apply) uses Opus; "light" work (planning, summaries, picking the next project) uses Sonnet. Mode is automatic with an Opus-to-Sonnet fallback.
- **Database:** SQLite at `dashboard/tasks.db` (not committed; it is exported to `docs/history/`).
- **Obsidian vault:** `C:\Vault` holds journal, research, standards and the roadmap (copies in `docs/vault/`).

## Lead pipeline

Optional research, then plan, then questions for you (each has a default answer used after 90 seconds), then crew tasks with self-check, peer review, code check, revisions, cross-fix and escalation, lead review, retries, and finally an Apply step.

Project statuses: queued, planning, waiting, running, reviewing, paused, done. Apply statuses: none, proposed, approved, applying, applied, skipped, failed, blocked. The oldest queued project starts when the lead is free. A project left mid-run by a restart starts over if it is under a day old.

## Apply step and its safety rules

- A **readiness gate** runs first. If anything needed is missing, the lead answers with one `NOT_READY: ...` line and changes nothing. This stopped projects 4 and 5 (a missing library, a truncated file, undecided details).
- Tools are on an allowlist per server. No outbound requests, uploads, asset downloads or AI generation.
- Never delete anything. No third-party `insert_asset` unless the plan names it.
- A crew script may only be replaced after it is backed up as a StringValue under `ServerStorage.Backups`.
- Studio access for computer control expires after 30 minutes idle.

## Autopilot and the changes log

The **AUTOPILOT** button turns on a loop (`autopilot.py`): it applies finished projects, waits while a project runs, queues the next item from the roadmap, caps at 6 projects a day, and pauses ("needs you") after 2 blocked or failed applies in a row. The **CHANGES** tab lists plain-words, timestamped summaries, newest first. Routes: `GET/POST /api/autopilot`, `GET /api/changes`, `POST /api/changes/sync`.

## Security standard

`docs/vault/security-architecture.md` (rules S1-S10, D1-D6 anti-dupe, A1-A7 architecture) is injected into the plan and review prompts. Highlights: server authority, validate every remote argument, rate limits, no server-to-client RemoteFunctions, one mutation module with an audit log, session-locked saves (ProfileStore), data versioning and migrations, no unvetted Toolbox assets. The reason for it: the original Islands game died to hackers, dupers and a codebase nobody could update. `docs/vault/audit-1.md` is the first audit and its fixes shipped as project 3.

## Reuse first

Research and planning prompts require checking for existing, maintained code (license, last update, long-term fit) before writing our own.

## Re:islands build log (summary)

1. Stage 1 rebuild (project 2): saving, island building, crafting.
2. Security fixes (project 3): Config, RemoteGuard rate limiting, ToolService, PlayerData hardening.
3. Built directly in Studio with `docs/build-prompts/`: island permissions, mining and hub ore rocks, extra recipes, hub shop, custom hub map with an ore cave, island block art and effects, three shop sellers, fishing.
4. In progress or planned: working portals and a mob zone, animations, a second security audit.
5. UI mockups in a Figma file (page "UI v1"): shop, permissions, hotbar, coin display.

All numbers in the game are placeholders. Details and test results for each step are in `docs/history/changes.md` and `docs/history/lead-projects.md`.

## Known gaps

- Real hub and island place IDs for portals are not known; portals use same-place teleports.
- Several parts were only tested by script (no hand test): tool swing, shop and fishing UI, NPC animation, two-player cases, real saves across a rejoin.
- The Roblox scripts live inside the Studio place, not in this repo.

## Run it

1. Python 3.12, then `python -m venv .venv` and install FastAPI, uvicorn, litellm, httpx and pydantic.
2. Copy `config.example.yaml` to `config.yaml` and `.env.example` to `.env`, and set your own proxy key.
3. Run Ollama with the models named in the config.
4. Run `tools/three-vendor/vendor.py` if the three.js files are missing.
5. `.venv\Scripts\python.exe -m uvicorn dashboard.app:app --host 127.0.0.1 --port 8080`, or start `desktop_app.py`.
6. Install the Claude Code CLI and sign in; the lead calls `claude -p`.

## Agents and models

See [docs/agents.md](docs/agents.md) for the crew roles, Qwen models, lanes and prompts.

