# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person, the owner of this machine, running a small crew of local AI models. Uses the dashboard about equally in two ways: left open on screen as something to glance at while other work goes on, and as a work session to queue a task, follow it, and read the result.

## Product Purpose

Cyberpunk Arasaka Tower Office (renamed from Night City Office, 2026-10-16) is a local control room for the LiteLLM roles. It queues tasks to a role, runs them, chains or hands results from one role to the next, and shows who is working on what. Success: at a glance the user knows which machine is busy, and in a session they can assign, follow and act on tasks without leaving the page.

## Positioning

The crew is two physical machines working in parallel. The PC lane (coder, planner, on the PC GPU) and the laptop lane (vision, memory, trimmer, on the laptop at 192.168.x.x) each run one task at a time, independently. Chains and hand-offs move a task's result between roles, often across machines. Claude Code (David) is the boss, working from the cloud.

## Operating Context

- Served by FastAPI on 127.0.0.1:8080 only; opened in the desktop app (pywebview window) or a browser.
- Live data: `/api/roles` (busy, current task, last status/duration, lane per role) and `/api/tasks` (four columns: queued, running, done, failed), polled.
- Task results are also written to `C:\Vault\tasks\task-<id>.md`. Planner and coder output are drafts.
- The desktop app injects a fixed banner (`#nco-laptop-banner`) at the top of the page when the laptop's Ollama is unreachable.
- Sound, if ever added, is off by default.

## Capabilities and Constraints

- Must keep: the assign form (role, optional title, input, image path for vision only, timeout 1-3600 s, up to 3 chained "then hand to" steps, Ctrl+Enter); the four task columns; task details with Hand off (done tasks), Retry (failed tasks) and Cancel (queued tasks); the LIVE / CONNECTING badge; live role status from `/api/roles`; the laptop-unreachable banner.
- Fully local: no outside requests of any kind. The Content-Security-Policy header in `dashboard/app.py` stays unchanged (self only; `img-src` also allows `data:`; no inline scripts or styles).
- Lanes: one running task per machine at a time; queued tasks wait per lane.
- Roles: coder, planner, vision, memory, trimmer (API). Display-only: claude-code (David, cloud).

## Brand Commitments

- Name: "Cyberpunk Arasaka Tower Office", to appear everywhere: the dashboard, the desktop app window title and the desktop shortcut.
- The bundled VT323 font (`dashboard/static/fonts/VT323-Regular.ttf`, SIL OFL 1.1) stays and is served locally; its license credit stays on the page.
- Offered and not selected as fixed: the named pixel crew (Maine, Lucy, Rebecca, Kiwi, David, Falco, Hermes), the pixel-art look, and the previous Night City treatment. They may be kept or replaced by the redesign.

## Evidence on Hand

- Live task history in `dashboard/tasks.db` (real titles such as "Plan a sword shop", "Shop bug: trim → plan → code").
- Existing pixel-art crew sprites drawn in `dashboard/static/office.js`.
- No logos or brand assets exist. Arasaka is a fictional corporation from the Cyberpunk franchise; use the name in text only and do not copy its official logo or marks.

## Product Principles

1. Machine state first: which lane is busy, and with what, must read in one glance from across the desk.
2. Never hide a failure or an offline machine.
3. Every control that works today keeps working; the redesign changes the room, not the job.
4. Local and self-contained: nothing leaves this PC except what goes to the laptop.
