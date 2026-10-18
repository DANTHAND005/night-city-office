# Re:islands roadmap
Edit freely. Autopilot reads this before choosing each project and appends finished work under Done log.
Rules: follow the security and architecture standard in C:\Vault\standards. Small, testable projects. Never repeat finished work.

## Next, in rough order
- Island permissions (Visitor, Builder, Co-owner, Blocked, blocked list, permissions tab UI)
- Mining with tool tiers, and hub ore rocks that grow back
- Hub and island portals (needs the real place IDs from the user first, so ask the user)
- Shop and selling at the merchant, server-checked
- Starter island content: grass, trees, dirt, the first block types
- Island saving: what you build persists between visits
- Spawn and respawn handling
- Trading between players (two-phase, atomic, audited)
- Admin and logging tools: give items, view the audit log, ban
- Visual pass: block looks, portal, hotbar and crafting UI, tool swing animation, using the Research tab references
- Tutorial and first-time prompts

## Done log
- #1 Islands Remake: Stage 1 Core: done
- #2 Re:islands Stage 1 rebuild: applied
- #3 Re:islands audit-1 security and data fixes: applied
- #4 Re:islands Island Permissions: blocked
- #5 Re:islands Mining, Tools and Hub Ore Rocks: blocked

## Phase 2: World and art (added by owner request 2026-10-17)
1. Islands: block-based. Design pass for block set (grass, dirt, stone, ore variants), textures, break and place animations, break particles and sounds.
2. Hub: fully custom handmade map, NOT mineable, no block grid. Contains spawn, shop stall, portal ring, and an ORE CAVE area (the only mineable part of the hub; HubRock nodes live there, respawn on timer).
3. Shop sellers: several NPC sellers/stalls (materials buyer, tool seller, later cosmetics). Reuse ShopServer.
4. More portals to areas with mobs (needs real place IDs or in-place zones; start in-place zones via TeleportService stub).
5. Fishing spots: server-owned bite timer, rod tiers in ItemData, loot table, anti-macro checks.
6. Mobs: server-side AI, health, drops through PlayerData, simple area zones.
7. Animations: tool swing, mine, fish cast, equip. Reuse free-licensed/own animations only; check license.
8. Tools and block visuals: per-tier models (wood, stone, iron), made in Blender where possible, Figma only for UI (View seat blocks writes).
Order: hub map + ore cave, then island block art, then sellers, fishing, mobs and portals, then animations.
Reuse-first and the security standard apply to every item.

- 2026-10-17: permissions, mining, 4 recipes, hub shop built directly in Studio (placeholders; real two-player test pending).
