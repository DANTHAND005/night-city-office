# The agent crew and the models behind it

Night City Office is a Claude lead plus five local Ollama roles. This page lists who does what, which model backs each role, and where the prompts live. It is written from `config.example.yaml`, `dashboard/worker.py`, `dashboard/db.py` and `dashboard/journal.py`.

## Roles and models

| Role | Model | Where it runs | Used for |
|---|---|---|---|
| coder | qwen3:8b (config.example.yaml) | PC, Ollama at localhost:11434 | Writes the code for each plan step (Luau, Python, JS) |
| planner | qwen3:8b | PC | Specs, outlines, brainstorming ideas for the backlog |
| vision | qwen3-vl:4b | Laptop, Ollama at 192.168.x.x:11434 | The only role that can read images (screenshots, mockups) |
| memory | custom `memory-cpu` model (the lessons file lists llama3.2:3b) | Laptop (CPU) | Notes and summaries for the Obsidian vault |
| trimmer | custom `trimmer-cpu` model (the lessons file lists qwen3:1.7b) | Laptop (CPU) | Shrinks long text before it goes to another role |
| lead | Claude Code (opus for builds) | Cloud, driven by `dashboard/lead.py` | Plans projects, reviews crew output, runs the Apply step |

The `memory-cpu` and `trimmer-cpu` names are local Ollama models on the laptop; their Modelfiles are not in this repo, so the base models above are only what the lessons file records. Pull qwen3:8b and qwen3-vl:4b to reproduce the rest.

Models are not called directly. Every role goes through a LiteLLM proxy on 127.0.0.1:4000 (`start_proxy.ps1`, key from `.env`), and the role name is the LiteLLM `model_name`. `local_llm.py <role> "<prompt>"` is the command-line way to call one. Roles that reason for too long on qwen3 default to `think=false` unless `--think` is passed.

## Lanes

`dashboard/worker.py` runs two lanes, each one task at a time, so one PC task and one laptop task can run together:

- pc: coder, planner
- laptop: vision, memory, trimmer

Tasks live in SQLite (`tasks.db`, not in the repo). A task can carry `next_steps` that spawn follow-up tasks for other roles.

## Prompts and lessons

- `docs/vault/agents/<role>.md` holds the lessons the lead writes back after each project. They are read into the next plan and the agents' prompts. Present: coder, planner, lead, plus `claude-code/resume-prompt.md`, the hand-off prompt for a fresh Claude Code session.
- `docs/vault/templates/` holds saved project plans, for example the Re:islands stage 1 rebuild.
- `docs/build-prompts/` holds the direct-build prompts Claude ran into Roblox Studio, Blender and Figma.
- Skills are small distilled `.md` files appended to a role's system prompt; small models get at most a few.

## Lead pipeline in one line

Claude plans, splits work across the roles, reviews each result, then the Apply step pushes it into Studio, Blender or Figma through the MCP servers in `lead_mcp.json`, behind a readiness gate and backups. See README.md for the safety rules.

## Known limits

- The crew stalled on tasks with missing libraries, truncated files or undecided details, so many Re:islands steps were built directly by Claude instead.
- The 8B model needs short, concrete tasks and benefits from the lessons file.
