---
tags: [standards, security]
applies_to: every Roblox project (Re:islands and others)
sources: Roblox Creator Docs (security tactics, defensive design, access control, third-party vulnerabilities), Roblox DevForum (Secure RemoteEvents, ProfileStore, DataStore best practices)
---
# Security and architecture standard

The lead puts this in every plan and checks every result against it. Edit freely: it is read fresh each project.
Goal: no big exploits, no dupes, and code that can be updated without breaking old saves. Nothing is hack-proof, so also detect and be able to reverse.

## Security
- S1 Server authority. The server decides damage, prices, amounts, drops and placement. Clients only send input and draw the world.
- S2 Validate every remote argument on the server: type, range, existence, and that the player owns it. Check the type of a value before comparing or indexing it.
- S3 Never accept an amount, price, position or result from a client. Compute them from server data. Measure distance between the server-side character and the target.
- S4 Rate limit every remote per player, and ask what happens if it fires 1000 times a second. Add cooldowns on the server, not the client.
- S5 Keep logic and data in ServerScriptService or ServerStorage. Anything in ReplicatedStorage or Workspace is visible to exploiters. Never mix server and client logic in one ModuleScript in a replicated place.
- S6 No server-to-client RemoteFunction calls (a client can hang them). Client to server only, and prefer RemoteEvents.
- S7 No third-party Toolbox models, plugins or free scripts without reading every script. Backdoors hide in normal-looking models. Prefer writing our own or using vetted open-source with a permissive license.
- S8 Design so cheating gains nothing: server cooldowns, sequential checks for rewards, no rewards for obviously farmed actions.
- S9 Teleports: set place access control to secure-within-universe, verify progression on the server, never trust data the client carries between places.
- S10 Never hardcode secrets. Use non-obvious names for sensitive remotes and scripts. Log suspicious input and use the Ban API for repeat offenders.

## Anti-dupe and economy
- D1 All item and currency changes go through one server module (add, remove, move). No other script edits inventory data.
- D2 Use ProfileStore. Start a session on join, end it on leave, handle OnSessionEnd by kicking the player, use Reconcile for new fields. Never fall back to a default profile after a failed load.
- D3 Autosave and save on leave. Test with Studio API access on before shipping any data change.
- D4 Trades and shop sales: check both inventories on the server, lock both sides, then swap in one step or not at all. No yields between the check and the change.
- D5 Every economy change writes an audit line (player, item, amount, reason, time) so dupes can be found and reversed.
- D6 Cross-server messages (gifts, trades with offline players) use MessageAsync, never direct writes to a profile that is in a session.

## Architecture (so it can be updated)
- A1 One ModuleScript per system with a small public API. A new feature must not need edits inside old systems.
- A2 Item, recipe and block definitions live in one data module, so balance changes are edits, not rewrites.
- A3 Saved data has a version number and a migration function for each version step.
- A4 Config values (cooldowns, limits, prices) live in one config module.
- A5 Every system has a short test checklist, including attempted exploits.
- A6 Check for existing proven open-source code before writing our own. Prefer USE or ADAPT with a permissive license, credit the author, never copy code or art without a license.
- A7 Comments say why, not what. Name remotes and modules by what they do.

## Audit rule of thumb
For each remote: who can call it, with what, how often, what is the worst thing they can make it do. If the answer is "anything", it fails.
