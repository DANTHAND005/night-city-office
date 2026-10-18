---
tags: [audit, security]
date: 2026-10-17
---
# Re:islands security audit 1 (183s)

# Re:islands security audit

I audited Studio `e469560b…` (Re:islands, placeId 111912983084886) and made no changes to the place. The playtest has been stopped and nothing was saved.

**Scope:** I read all 10 scripts. One is the stock `ProfileStore` (MAD STUDIO / loleris); I checked it for backdoor patterns and found none. It uses HttpService only to generate GUIDs. The place has no remotes at edit time. `ServerScriptService.Setup` creates three RemoteEvents at runtime in `ReplicatedStorage.Remotes`: `Craft`, `Equip` and `PlaceBlock`. There are no RemoteFunctions (S6 passes).

## Remotes

| Remote | Who / with what | How often | Worst case | Verdict |
|---|---|---|---|---|
| `Craft` (`CraftingServer:39`) | Any client, `recipeName` (anything) | Server cooldown 0.5 s | Spams crafts at 2/s using real materials. It can't craft for free or duplicate. | **Pass**, with gaps (no logging, items not saved) |
| `Equip` (`CraftingServer:79`) | Any client, `tool` (anything) | **No limit** | Equips or unequips their own tools only. | **Pass**, low risk |
| `PlaceBlock` (`IslandServer:135`) | Any client, `island`, `position` | Token bucket: 10 burst, 5/s | Places up to 500 free blocks on their own island, stacked in one cell, from anywhere they teleport to. | **Pass on security, fails S1/S8 on design** |

## Attack test results

Baseline was Coins 100, Wood 20, Stone 10.

| Attack | Result |
|---|---|
| `Craft` with nil, numbers, NaN, `true`, `{}`, `""`, a 100 KB string, `"Wood"`, `"WoodPickaxe\0"`, Instances, Vector3 | All rejected: no tools created, no materials spent |
| `Equip` with a number, a string, `workspace`, the island, the Player, a client-made Tool, nil | All rejected without errors |
| `PlaceBlock` with nil, a string position, NaN, inf, ±1e9, 5000 studs away, just outside bounds (X+31), below the base, wrong instance (`workspace`, `Base`), island passed as a string | All rejected |
| 200 rapid `PlaceBlock` calls | 10 accepted (the bucket works) and **all 10 stacked in the same grid cell** |
| 200 rapid `Craft` calls | 1 accepted (Wood 20 → 15) |
| 200 rapid `Equip` calls | All processed, no limit, harmless |
| Client teleports its own character above the island, then places a block | **Accepted.** The reach check uses the HumanoidRootPart, whose position the client controls. |
| Craft, then reset the character | **Tool lost and the 5 Wood stays spent** (verified on the server: 0 tools, Wood 15) |
| Another player's island | Couldn't test live with one player. The code checks `OwnerUserId`, a server-set attribute, and a client can't change it from its side, so this passes on code review. |

The server console showed no errors from the game scripts, only Roblox CoreGui warnings.

## Findings

### High
1. **Crafted items are not saved, so players lose what they paid for (D1, D3, A3).**
   - Where: `CraftingServer:73-76`. Craft makes a plain `Tool` in the Backpack. The profile never records it.
   - What happens: the item disappears on death, respawn or rejoin, while the material cost is already deducted. No cheat is needed; it happens to every player. It also means the profile can't serve as the record of items, so there is nothing to find a dupe against.
   - Fix:
     - Add `Items = {}` to `TEMPLATE`.
     - Add `PlayerData.AddItem` and `PlayerData.RemoveItem`.
     - In Craft, deduct the cost and add the item in one function inside `PlayerData`, with no yields in between.
     - Rebuild Tools from `Data.Items` on `CharacterAdded`.

2. **There is no audit trail at all (D5, S10).**
   - Where: `PlayerData.AddCoins` and `PlayerData.AddMaterial`.
   - What happens: no change to coins, materials or items is logged, and rejected remote calls are dropped silently. A dupe or exploit could not be found or reversed.
   - Fix: inside `PlayerData`, write one line per change (`userId, field, delta, newValue, reason, os.time()`) to a capped list in the profile or to a separate DataStore. Add a `reason` parameter to every mutator. Count rejected calls per player and log anyone over a threshold.

3. **Saved data has no version or migrations (A3, D2).**
   - Where: `PlayerData` `TEMPLATE`.
   - What happens: `Reconcile` adds missing fields, but renaming or restructuring a field later will break old saves.
   - Fix: add `Version = 1` to `TEMPLATE`. After `Reconcile`, run `MIGRATIONS[v](data)` while `data.Version < CURRENT`.

### Medium
4. **Blocks are free and can stack in one cell (S1, S8, S3).**
   - Where: `IslandServer:198-211`.
   - What happens: blocks cost no materials, and nothing checks whether a cell is already filled. The test put 10 parts in one cell; one player can put 500 overlapping parts on their island.
   - Fix:
     - Keep an `occupied[snappedKey]` set per island and reject filled cells.
     - Charge a material through `PlayerData.AddMaterial(player, "Stone", -1)` before creating the part, and reject the placement if that fails.

5. **The reach check trusts the client's character position (S3).**
   - Where: `IslandServer:175`.
   - What happens: tested and confirmed. A player can teleport and build from anywhere. The impact is limited because placement is still restricted to their own island's bounds.
   - Fix: also reject the call if the root part is more than about 60 studs outside the island's bounds, or if it moved faster than the WalkSpeed allows since the last check. Log both cases.

6. **Studio playtests always use mock data (D3).**
   - Where: `PlayerData:79-81`. `Store.Mock` is always used in Studio, even with API access on.
   - What happens: the console says "data will be saved", but saving and loading are never actually tested before shipping.
   - Fix: put the mock behind a config flag (`USE_MOCK_IN_STUDIO`) and turn it off for save tests.

7. **No config module (A4) and no shared item data module (A2).**
   - Where: `CRAFT_COOLDOWN`, `MAX_REACH`, `MAX_BLOCKS`, the bucket values and `TEMPLATE` are spread across files.
   - Fix: move them into `ServerScriptService.Modules.Config`. Recipes in ReplicatedStorage are fine as display data.

### Low
8. **`Equip` has no rate limit (S4).** Calls are cheap, but 1000/s still runs the handler. Fix: reuse a token bucket.
9. **No Cancel/kick when a session can't start for a player who already left (D2).** Behaviour is correct (it kicks or ends the session). The profile also never handles `MessageAsync`, which you'll need for gifts or trades (D6).
10. **Remote names are obvious, there is no Ban API, and nothing is logged (S10).** Fix: log rejected calls and ban on repeated hits.
11. **No test checklists exist (A5).**

## What passed
- Every remote checks argument types before using them, including NaN and inf checks (`math.isfinite`) (S2).
- `PlaceBlock` checks ownership from a server-set attribute and the island-bounds check holds (S2).
- Recipe and cost lookups happen on the server; the client only sends a name (S1, S3).
- `HasMaterials` and the deduction run with no yield in between, so there is no dupe window (D4).
- Craft cooldown and the `PlaceBlock` token bucket both work under 200-call bursts (S4).
- No RemoteFunctions (S6). Logic lives in ServerScriptService (S5).
- ProfileStore setup: session start, `Reconcile`, kick in `OnSessionEnd`, kick instead of a default profile when loading fails, `EndSession` on leave (D2).
- Only `PlayerData` changes coins and materials (D1, so far).
- No Toolbox assets, plugins, `require(id)` calls or secrets (S7, S10).

## Five fixes to do first
1. Save crafted items in the profile and rebuild them on spawn, with the craft done atomically inside `PlayerData` (#1).
2. Write an audit line for every economy change and log rejected remote calls (#2).
3. Add `Version` and a migration table to the saved data (#3).
4. Make block placement cost materials and reject filled cells (#4).
5. Move the limits into a Config module and add an `USE_MOCK_IN_STUDIO` flag so you can test real saves (#6, #7).
