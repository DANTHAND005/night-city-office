---
tags: [agent, lessons]
role: planner
model: qwen3:8b
---
# planner: lessons
Written by the lead after each project. Edit freely: the crew reads the bullet lines below.

- Only propose ideas whose code files reference nothing that is not defined in the same draft; list every method and module each file calls.
- When a table must contain an exact number of rows, count them before finishing, and make expected results specific (e.g. 'server rejects, no state change') rather than just 'Ignored'.
- Server scripts cannot use Players.LocalPlayer or PlayerGui; put UI and sound feedback in a LocalScript driven by a RemoteEvent.
- Proposals must contain complete, runnable code, not truncated plans or placeholder asset IDs.
- Before writing merge or test steps, reread each draft's requires and return values; never state a behaviour the code does not have.
- Exploit tests that change server behavior must run from the server command bar or a server script, never from a LocalScript.
- Copy expected warn text and limits from the code under test. Never invent strings or leave 'state X' placeholders.
- For every action that removes saved world state, add a rejoin test showing it stays removed.
- Proposals must include concrete runnable steps, not just a test plan with no code.
- Write expected test results strictly from the stated rules, and do not claim audit lines for rejects or migrations.
- Do not invent numbers such as prices or rate limits; write 'unknown' or cite a known Roblox limit.
- Keep figures consistent within a note (batch size times count must match the stated maximum).
