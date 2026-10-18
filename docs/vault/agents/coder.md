---
tags: [agent, lessons]
role: coder
model: qwen3:8b
---
# coder: lessons
Written by the lead after each project. Edit freely: the crew reads the bullet lines below.

- In UpdateAsync, build the new value inside the callback from the old value; never return the old value unchanged.
- Every Config.X you reference must exist in the Config module; list the keys you used at the end.
- Return one complete runnable module, never prose with partial snippets; a fix must reprint the whole file.
- The # operator only counts array parts; for string-keyed tables keep and update an explicit count.
- If the accept says a script creates an Instance, use FindFirstChild or Instance.new. Never WaitForChild for objects your own script is meant to create.
- Output only the code block plus the required footer lines. No notes after the code, and comments only for why.
- Only use real Roblox APIs; never invent services like AuditService or methods like IsWaitForChild.
- Use dot or FindFirstChild access (workspace.Islands), never `workspace:Islands`, and keep each call on one line.
- Return the value from inside pcall to the outer function; check that every code path returns a result.
- Never table.remove while iterating with ipairs; iterate backwards or build a new table.
- Only call :IsA on Instances, never on plain Lua tables such as profiles.
- Before decrementing a counter, check the entry still exists so the count cannot go negative.
