# Changes log (timestamped)

## 2026-10-17 14:07  #1 (project)

The crew drafted Stage 1 of the Islands remake as 11 Luau scripts (ItemDefs, Inventory, IslandGrid, Teleport, PlayerData, IslandServer, Crafting, HubServer, Sprint, BlockInput and GameUI) plus a Studio setup guide with a test checklist. None of it has been put into Studio yet. Seven scripts (Inventory, IslandGrid, Teleport, Crafting, Sprint, BlockInput and HubServer) look usable after a quick read. GameUI is only fragments with no hotbar, coins label or crafting panel, PlayerData would leave players' saves locked after they leave, and IslandServer can hang when a player joins and can change an island's owner, so all three need fixes. ProfileStore also still has to be added by hand in ServerScriptService under Modules.

## 2026-10-17 14:07  #2 (project)

Stage 1 of Re:islands was rebuilt from scratch and applied in Studio. Ten scripts now handle saving player data (PlayerData, in ServerScriptService.Modules), building each player's island (Setup and IslandServer, in ServerScriptService), and crafting four tools (CraftingServer in ServerScriptService, Recipes in ReplicatedStorage). The coins display, hotbar and crafting panel come from GameUI and its three parts in StarterPlayerScripts. A playtest passed: players got an island, started with 100 coins, 20 wood and 10 stone, and could craft and equip a pickaxe, after a crafting bug that would have blocked every tool was fixed during the apply. The place has not been saved yet, players still can't place blocks, and crafted tools have no handle, so equipping one may need a small fix.

## 2026-10-17 16:35  #3 (project)

Applied the first round of security and saving fixes to Re:islands in Studio: new Config, RemoteGuard and ToolService scripts in ServerScriptService.Modules, plus updates to PlayerData and CraftingServer. Crafting is now rate-limited so spamming gets rejected. Coin and material changes now need a reason and a whole number, and crafted items are saved in the player's profile and handed out as stacks of up to 9999. The old versions of the changed scripts were backed up in ServerStorage.Backups first, and a one-player test showed no errors. Still unchecked: whether crafted items survive a rejoin, and whether an old save upgrades correctly.

## 2026-10-17 18:23  #4 (project)

The island permissions system was drafted as scripts for PermissionsConfig, RateLimiter, Permissions, IslandEnterGuard, PermissionsService, the PermissionsPanel screen, a patch for block placing, and a self-test. None of it was applied to Studio, so the "Re:islands" place is unchanged. The save-data script, PermissionsData, came out as loose fragments with bugs and has to be rewritten, and the PermissionsPanel screen was cut off partway through. Applying is blocked until a few things are settled: the missing "t" checking library, where blocked players should be sent (the place has no hub), how the permissions code reads player save data, and whether the block-placing rule in IslandServer may be replaced.

## 2026-10-17 19:04  #5 (project)

The mining system for Re:islands was written as ten pieces: the mining settings, the item data, the MiningTarget, HubRocks, BlockHealth and MiningService scripts, the player-side script, a logic test, an exploit checklist and a setup guide. The server makes every decision about a mining hit (distance, tool, timing and who owns the island), so players can't cheat by faking requests. None of it was applied to Studio, because the apply step stopped before making any changes. It needs a missing package, a decision on where the item data lives, which blocks count as stone, which parts become ore rocks, and how mined ore is saved. Four known problems also remain to fix: MiningService could freeze at startup, mined blocks might come back after a rejoin and allow endless ore, one script has stray text that must be removed, and another script can error if a folder is missing.

## 2026-10-17 20:54  #0 (direct)

Added island permissions: owner, co-owner, visitor and blocked roles, a server-checked remote, a P-key owner panel, and block placing now respects roles. Blocked players are sent to spawn. Tested with the real module; a real two-player test is still to do.

## 2026-10-17 20:54  #0 (direct)

Added mining: tool tiers and block health in ItemData (placeholder numbers), a server-side MiningServer with reach, cooldown and ownership checks, 6 respawning hub rocks, and four new tool recipes. Mock playtest: pickaxe broke a block in 4 strikes and a rock in 6, drops landed in Materials, real save untouched.

## 2026-10-17 20:54  #0 (direct)

Added the hub shop: sell Wood, Stone, Coal and IronOre, buy six tools, all prices placeholders. The server checks range, item, amount and ownership. Playtest: sold 5 Wood (+5 coins), bought a StonePickaxe, and 8 bad requests changed nothing. The audit log and the on-screen panel are not yet seen working.

## 2026-10-17 21:17  #0 (direct)

Built the custom hub in Workspace.Hub: a cobblestone plaza around spawn and the shop, paths, 16 lanterns, 13 trees, a walled boundary with cliffs, 3 empty portal pads under arches, 2 empty stall spots, and an ore cave with 12 hub rocks (4 stone, 4 coal, 4 iron). 212 parts, none mineable. Players cannot yet walk between their island and the hub; that waits on the portals. Climbing out over the cliffs and real in-game lighting are untested.

## 2026-10-17 21:38  #0 (direct)

Added island block art: BlockData with six block types (grass, dirt, stone, coal, iron, plank), each island now starts with 13 blocks (grass over dirt, stone, 2 coal, 1 iron), break particles, a hit shake and a place pop, and a tool swing that moves the right arm. Players can only place stone or plank blocks, so ore can't be bought for 1 Wood. Playtest: a grass block broke in 2 strikes with green particles. The swing, the place pop and sounds are not verified; no sounds were added.

## 2026-10-17 21:38  #0 (direct)

Drew the first UI mockups in the Re:islands Figma file, page UI v1: Shop Panel, Permissions Panel, Hotbar Screen, and Coin Display with a toast. Plain frames with placeholder icons and no reusable components yet; I could not view the rendered images, so they need a look in Figma.

## 2026-10-17 22:05  #0 (direct)

Added three shop sellers (Ore Buyer, Tool Smith, Fisher) with simple built NPCs, and fishing: three rod tiers, four fish, a pond with three docks in the hub, and a server-owned bite timer and reaction window. Scripted tests passed (29 shop checks, 20 fishing checks, including wrong-stall, too-far, early and late reels, double cast, and rate limiting). Not tried by hand: real mouse clicks, NPC animation, the bobber on screen, real saves, or two players.

