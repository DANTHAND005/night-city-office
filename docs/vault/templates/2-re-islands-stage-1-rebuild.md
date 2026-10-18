---
tags: [template]
title: Re:islands Stage 1 rebuild
source_project: 2
---
# Template: Re:islands Stage 1 rebuild

Idea it solved: Re:islands Stage 1 repair. Rebuild three pieces from the earlier Islands Stage 1 report: PlayerData using ProfileStore (at ServerScriptService.Modules.ProfileStore) with proper session end on leave, IslandServer with the type check, WaitForChild and owner bugs fixed, and GameUI as a full LocalScript with hotbar, coins and crafting panel. Keep the other Stage 1 pieces as they are. Apply into Re:islands in Studio.Re:islands Stage 1 build. The Studio place is empty, so build all of Stage 1 fresh using the earlier Islands Stage 1 report as the spec. PlayerData must use ProfileStore (at ServerScriptService.Modules.ProfileStore) and release the session when a player leaves. IslandServer needs a proper type check, WaitForChild, and owner checks. GameUI must be a full LocalScript with hotbar, coins and crafting panel. Apply into Re:islands in Studio.

## Spec
## Goal
Build Stage 1 of Re:islands fresh in the empty Studio place: PlayerData (ProfileStore, session released on leave), IslandServer (type, WaitForChild and owner checks) and GameUI (hotbar, coins, crafting panel).

## Assumptions
- The earlier Islands Stage 1 report is not available to the crew, so the plan below defines the interface contract itself. The 'other Stage 1 pieces' are limited to a small Setup script, a Recipes module and a CraftingServer script. Anything else from the report needs to be added as a separate task.
- The crew only produces script text. The lead applies it into Studio using the checklist from the last task.
- ProfileStore already exists at ServerScriptService.Modules.ProfileStore and is not rewritten.
- Crafted tools are not saved. Only coins and materials persist.
- GameUI is one LocalScript (entry point) with three small child ModuleScripts (Coins, Hotbar, Crafting). This keeps each file small enough for the 8B coder. The lead can inline them afterwards if a single file is required.

## Contract
Remotes in ReplicatedStorage.Remotes: Craft(recipeName), Equip(tool), PlaceBlock(island, position). Islands are Models Island_<UserId> in Workspace.Islands with attribute OwnerUserId. PlayerData exposes Start/Get/AddCoins/AddMaterial/HasMaterials and replicates through player attributes 'Coins' and 'Mat_<name>'. The client only reads them.

## Key fixes
- PlayerData keeps the profile object, calls StartSessionAsync with Cancel, AddUserId, Reconcile, and OnSessionEnd. It calls profile:EndSession() on PlayerRemoving.
- IslandServer uses typeof checks, IsDescendantOf, math.isfinite, a server-side owner check, WaitForChild with timeouts and nil handling, and a token-bucket rate limit.
- GameUI never sets coins itself. Equip and craft go through the server.

## Answers

- The earlier Islands Stage 1 report was not provided. Are there other Stage 1 pieces (beyond PlayerData, IslandServer, GameUI) that must be rebuilt now? -> No. Build only the three named pieces plus the small Setup, Recipes and CraftingServer support scripts defined in this plan. (assumed)
- How do players get materials and coins in Stage 1? -> Only the starting grant (100 coins, 20 Wood, 10 Stone). No gathering or shop yet. (assumed)
- Is GameUI allowed to be one LocalScript plus 3 child ModuleScripts? -> Yes. The lead can merge them into a single file at the end if needed. (assumed)

## Tasks
```json
[
 {
  "ref": "t1",
  "role": "coder",
  "title": "Setup server script",
  "prompt": "Write ONE complete Roblox Luau server Script named Setup (it will live at ServerScriptService.Setup). Output only the code in one ```lua block, no placeholders.\n\nSHARED CONTRACT (all names exact):\n- ReplicatedStorage.Remotes (Folder) holds RemoteEvents: Craft, Equip, PlaceBlock.\n- Workspace.Islands (Folder) holds the player islands.\n- ServerScriptService.Modules.PlayerData (ModuleScript) returns a table with a Start() function.\n\nThe script must:\n1. Get ReplicatedStorage and Workspace via game:GetService.\n2. Create the Folder 'Remotes' in ReplicatedStorage if it does not exist (use FindFirstChild first), and inside it create RemoteEvents named Craft, Equip, PlaceBlock if missing.\n3. Create the Folder 'Islands' in Workspace if missing.\n4. Get ServerScriptService.Modules via WaitForChild('Modules', 10) and PlayerData via WaitForChild('PlayerData', 10). If either is nil, warn('Setup: PlayerData module missing') and return. Otherwise call require(playerDataModule).Start().\nCreate the folders and remotes BEFORE requiring PlayerData. Use only real Roblox APIs.",
  "accept": "Creates Remotes folder with Craft, Equip, PlaceBlock RemoteEvents only if missing; creates Workspace.Islands; uses WaitForChild with timeout 10 and nil checks for Modules and PlayerData; calls require(...).Start() after the folders exist",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t2",
  "role": "coder",
  "title": "Recipes module",
  "prompt": "Write ONE complete Roblox Luau ModuleScript named Recipes (it will live at ReplicatedStorage.Recipes). Output only the code in one ```lua block.\n\nIt returns an array (list) of recipe tables, each shaped {Name = string, Cost = {[materialName] = number}}. Material names are exactly 'Wood' and 'Stone'. Include exactly these 4 recipes in this order:\n1. WoodPickaxe: Wood 5\n2. StoneAxe: Wood 3, Stone 3\n3. WoodSword: Wood 8\n4. StoneHammer: Wood 4, Stone 6\nAdd one short comment line on top describing the shape. No functions, no other code.",
  "accept": "Returns a list of exactly 4 recipes named WoodPickaxe, StoneAxe, WoodSword, StoneHammer with the given Cost tables; each has Name and Cost; ends with a return statement",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t3",
  "role": "coder",
  "title": "PlayerData with ProfileStore",
  "prompt": "Write ONE complete Roblox Luau ModuleScript named PlayerData (it will live at ServerScriptService.Modules.PlayerData; the ProfileStore module is its sibling: require(script.Parent.ProfileStore)). Output only the code in one ```lua block. Write the whole script, no placeholders or '...'.\n\nSHARED CONTRACT:\n- PlayerData returns a table with: Start(), Get(player) -> data table or nil, AddCoins(player, n) -> boolean, AddMaterial(player, name, n) -> boolean (n may be negative; false if the player has no data or the result would be below 0), HasMaterials(player, cost) -> boolean (cost is {[name]=number}).\n- Data shape: {Coins = number, Materials = {[name] = number}}. Profile template: Coins = 100, Materials = {Wood = 20, Stone = 10}.\n- Replication: whenever data changes (and once after load) set player attributes 'Coins' and 'Mat_<name>' for every material (e.g. 'Mat_Wood'). Use player:SetAttribute. The client only reads them.\n\nProfileStore API (follow exactly):\n```lua\nlocal Store = ProfileStore.New('PlayerData', TEMPLATE)\nif RunService:IsStudio() then Store = Store.Mock end\nlocal profile = Store:StartSessionAsync(tostring(player.UserId), {\n  Cancel = function() return player.Parent ~= Players end,\n})\nif not profile then return player:Kick('Data load failed, rejoin') end\nprofile:AddUserId(player.UserId); profile:Reconcile()\nprofile.OnSessionEnd:Connect(function() Profiles[player] = nil; player:Kick('Session ended, rejoin') end)\nif player.Parent == Players then Profiles[player] = profile else profile:EndSession() end\n-- PlayerRemoving: local p = Profiles[player]; if p then p:EndSession() end; Profiles[player] = nil\n```\nRules:\n- Keep the PROFILE object in a table Profiles[player]; Data is profile.Data. Never store only profile.Data.\n- Start() connects Players.PlayerAdded, Players.PlayerRemoving, and also loads players already in game (loop Players:GetPlayers()). Run each load with task.spawn.\n- On PlayerRemoving call profile:EndSession() and set Profiles[player] = nil.\n- Never call Steal.\n- Before every write check profile:IsActive(); return false if not active. No yielding between the check and the write.\n- Validate n and cost values with typeof(n) == 'number' and math.isfinite(n); write 'typeof(x) ~= \"number\"', not 'not typeof(x) == ...'.\n- AddMaterial and HasMaterials treat a missing material as 0.\n- Only use real Roblox APIs.",
  "accept": "Uses ProfileStore.New with the template and Store.Mock in Studio; StartSessionAsync with a Cancel function; kicks on nil profile; calls AddUserId and Reconcile; stores the profile object in Profiles and calls profile:EndSession() in PlayerRemoving; exposes Start, Get, AddCoins, AddMaterial, HasMaterials; sets attributes 'Coins' and 'Mat_<name>'; checks IsActive before writes",
  "deps": [],
  "skills": [
   "roblox-luau"
  ]
 },
 {
  "ref": "t4",
  "role": "coder",
  "title": "CraftingServer script",
  "prompt": "Write ONE complete Roblox Luau server Script named CraftingServer (it will live at ServerScriptService.CraftingServer). Output only the code in one ```lua block. Write the whole script, no placeholders.\n\nSHARED CONTRACT:\n- ReplicatedStorage.Remotes (Folder) has RemoteEvents Craft (client->server, arg: recipeName string) and Equip (client->server, arg: tool Instance).\n- ReplicatedStorage.Recipes (ModuleScript) returns an array of {Name = string, Cost = {[materialName] = number}}.\n- ServerScriptService.Modules.PlayerData (ModuleScript) returns a table with: Get(player) -> data or nil, AddMaterial(player, name, n) -> boolean (n may be negative), HasMaterials(player, cost) -> boolean.\n- A crafted item is Instance.new('Tool') named after the recipe, RequiresHandle = false, Parent = player.Backpack.\n\nBehaviour:\n1. Get the services, then Remotes = ReplicatedStorage:WaitForChild('Remotes', 10), Recipes module = ReplicatedStorage:WaitForChild('Recipes', 10), Modules = ServerScriptService:WaitForChild('Modules', 10) and PlayerData = Modules:WaitForChild('PlayerData', 10). If any is nil, warn and return. Require Recipes and PlayerData.\n2. Craft.OnServerEvent(player, recipeName): ignore unless typeof(recipeName) == 'string'. Rate limit: at most one craft per player per 0.5 s (table keyed by player.UserId, using os.clock(); clear the entry on Players.PlayerRemoving). Find the recipe in the list by Name; ignore if not found. If not PlayerData.HasMaterials(player, recipe.Cost) then return. Otherwise deduct each material with PlayerData.AddMaterial(player, name, -amount) and create the tool in player.Backpack. Do the check and deduction without yielding in between. Look the Backpack up with player:FindFirstChildOfClass('Backpack') and return if nil.\n3. Equip.OnServerEvent(player, tool): ignore unless typeof(tool) == 'Instance' and tool:IsA('Tool'). Get character = player.Character and humanoid = character and character:FindFirstChildOfClass('Humanoid'); return if nil or humanoid.Health <= 0. If tool.Parent == player.Backpack then humanoid:EquipTool(tool). Else if tool.Parent == character then humanoid:UnequipTools(). Otherwise ignore.\nOnly use real Roblox APIs.",
  "accept": "Validates typeof(recipeName) == 'string' and typeof(tool) == 'Instance' with IsA('Tool'); checks HasMaterials then deducts with AddMaterial(player, name, -amount) and creates a Tool in Backpack; has a per-player rate limit cleaned on PlayerRemoving; Equip handler checks tool.Parent is Backpack or character and uses humanoid:EquipTool / UnequipTools with nil checks; WaitForChild calls have timeouts and nil handling",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t5",
  "role": "coder",
  "title": "IslandServer with fixed checks",
  "prompt": "Write ONE complete Roblox Luau server Script named IslandServer (it will live at ServerScriptService.IslandServer). Output only the code in one ```lua block. Write the whole script, no placeholders or '...'.\n\nSHARED CONTRACT:\n- ReplicatedStorage.Remotes (Folder) has RemoteEvent PlaceBlock (client->server, args: island Instance, position Vector3).\n- Workspace.Islands (Folder) holds one Model per player named 'Island_<UserId>' with a NUMBER attribute OwnerUserId and a child Part named 'Base' (Size Vector3.new(64,2,64), Anchored = true). The Model's PrimaryPart is Base.\n\nBehaviour:\n1. Get the Remotes folder with ReplicatedStorage:WaitForChild('Remotes', 10) and Islands with Workspace:WaitForChild('Islands', 10). Every WaitForChild on the server has a timeout and a nil check; if something is nil, warn and return. Get PlaceBlock with Remotes:WaitForChild('PlaceBlock', 10) the same way.\n2. Slots: a table slots[index] = userId. On Players.PlayerAdded (also loop Players:GetPlayers() at startup) pick the lowest free index starting at 1, build the island Model 'Island_<UserId>' with Base at Vector3.new(index * 200, 10, 0), set attribute OwnerUserId = player.UserId (number), parent it to the Islands folder. On CharacterAdded: character:WaitForChild('HumanoidRootPart', 10), if nil return, then character:PivotTo(CFrame.new(basePosition + Vector3.new(0, 6, 0))). On PlayerRemoving destroy the island, free the slot and clear the rate-limit entry.\n3. PlaceBlock.OnServerEvent(player, island, position) validation, in this order (return on any failure):\n   a. Token bucket per player.UserId: capacity 10, refill 5 tokens per second, using os.clock(). A call costs 1 token.\n   b. typeof(island) == 'Instance' and island:IsA('Model') and island:IsDescendantOf(islandsFolder). (Write it as 'typeof(island) ~= \"Instance\"', never 'not typeof(island) == ...'.)\n   c. typeof(position) == 'Vector3' and math.isfinite(position.X), math.isfinite(position.Y), math.isfinite(position.Z).\n   d. OWNER CHECK ON THE SERVER: island:GetAttribute('OwnerUserId') == player.UserId. Never trust any owner value from the client.\n   e. The player has a character with Humanoid (FindFirstChildOfClass) with Health > 0 and a HumanoidRootPart found with FindFirstChild (nil check), and (rootPart.Position - position).Magnitude <= 80.\n   f. base = island:FindFirstChild('Base'), nil check. position must be within math.abs(dx) <= 30 and math.abs(dz) <= 30 of base.Position, and position.Y between base.Position.Y + 1 and base.Position.Y + 41.\n   g. Count: island attribute 'BlockCount' (default 0) must be below 500.\n   Then snap position to a 4-stud grid (math.round(v / 4) * 4 on each axis), create a Part named 'Block', Size Vector3.new(4,4,4), Anchored = true, Position = snapped, Parent = island, and increase 'BlockCount' by 1.\nOnly use real Roblox APIs.",
  "accept": "Uses typeof(island) ~= 'Instance' style checks plus IsA('Model') and IsDescendantOf(islands folder); checks math.isfinite on all three position components; compares island:GetAttribute('OwnerUserId') to player.UserId on the server; every WaitForChild has a timeout and nil handling; uses FindFirstChild for HumanoidRootPart and Base; has a per-UserId token bucket; builds an island per player and cleans up on PlayerRemoving",
  "deps": [],
  "skills": [
   "roblox-luau"
  ]
 },
 {
  "ref": "t6",
  "role": "coder",
  "title": "GameUI LocalScript bootstrap",
  "prompt": "Write ONE complete Roblox Luau LocalScript named GameUI (it will live at StarterPlayer.StarterPlayerScripts.GameUI). Output only the code in one ```lua block. Write the whole script.\n\nIt has three child ModuleScripts named Coins, Hotbar, Crafting. Each module returns a function that takes one argument, the ScreenGui, and builds its own UI inside it.\n\nThe script must:\n1. local Players = game:GetService('Players'); local player = Players.LocalPlayer; local playerGui = player:WaitForChild('PlayerGui').\n2. Create a ScreenGui named 'GameUI' with ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling, IgnoreGuiInset = false, and parent it to playerGui.\n3. For each name in {'Coins', 'Hotbar', 'Crafting'}: local module = script:FindFirstChild(name); if module is nil, warn and continue; otherwise run pcall(function() require(module)(gui) end) and warn the error message if pcall fails, so one broken panel does not stop the others.\nNo other logic.",
  "accept": "Creates ScreenGui 'GameUI' with ResetOnSpawn = false parented to PlayerGui; loops over Coins, Hotbar, Crafting using script:FindFirstChild and pcall(require(module)(gui)); warns on missing module or error",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t7",
  "role": "coder",
  "title": "GameUI Coins module",
  "prompt": "Write ONE complete Roblox Luau ModuleScript named Coins (child of the LocalScript GameUI). Output only the code in one ```lua block. Write the whole script.\n\nIt returns function(gui) where gui is a ScreenGui. The function:\n1. Creates a Frame named 'CoinsFrame' in gui: AnchorPoint Vector2.new(1,0), Position UDim2.new(1,-16,0,16), Size UDim2.fromOffset(160,40), BackgroundColor3 Color3.fromRGB(30,30,30), BackgroundTransparency 0.2, with a UICorner (CornerRadius UDim.new(0,8)).\n2. Inside it a TextLabel named 'CoinsLabel', Size UDim2.fromScale(1,1), BackgroundTransparency 1, TextColor3 Color3.fromRGB(255,215,0), Font = Enum.Font.Gotham, TextSize 20, TextXAlignment Enum.TextXAlignment.Center.\n3. Reads the coins from the LocalPlayer attribute 'Coins' (player:GetAttribute('Coins') or 0) and sets Text to 'Coins: ' .. tostring(value). Updates the text whenever player:GetAttributeChangedSignal('Coins') fires.\nThe client NEVER sets the Coins value. Get the player from game:GetService('Players').LocalPlayer. Only use real Roblox APIs and valid Enum values.",
  "accept": "Returns function(gui); creates CoinsFrame with UICorner and a CoinsLabel using Enum.Font.Gotham; reads player:GetAttribute('Coins') or 0; updates through GetAttributeChangedSignal('Coins'); never writes the Coins attribute",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t8",
  "role": "coder",
  "title": "GameUI Hotbar module",
  "prompt": "Write ONE complete Roblox Luau ModuleScript named Hotbar (child of the LocalScript GameUI). Output only the code in one ```lua block. Write the whole script, no placeholders.\n\nIt returns function(gui) where gui is a ScreenGui.\n\nUI: a Frame named 'HotbarFrame' in gui, AnchorPoint Vector2.new(0.5,1), Position UDim2.new(0.5,0,1,-16), Size UDim2.fromOffset(9 * 60 + 8 * 6, 56), BackgroundTransparency 1, with a UIListLayout (FillDirection Horizontal, HorizontalAlignment Center, SortOrder Enum.SortOrder.LayoutOrder, Padding UDim.new(0,6)). Create exactly 9 TextButtons ONCE, named 'Slot1'..'Slot9', Size UDim2.fromOffset(60,56), LayoutOrder = i, Font Enum.Font.Gotham, TextSize 14, TextWrapped = true, BackgroundColor3 Color3.fromRGB(30,30,30), TextColor3 white, each with a UIStroke (Thickness 2, Color Color3.fromRGB(80,80,80)). Do not set Position on the slots (the layout does it). Slot text is '<i>' when empty, else '<i>' .. newline .. tool.Name.\n\nLogic:\n- Players.LocalPlayer. A list `order` (array of Tool instances) keeps the tools in the order they first appeared.\n- refresh(): for slots 1..9 set the text, and set the UIStroke color to Color3.fromRGB(255,215,0) when order[i].Parent == player.Character, else gray. Never create new slot buttons in refresh.\n- addTool(tool): if tool:IsA('Tool') and it is not already in order, append and refresh. removeTool(tool): after task.defer, if tool.Parent ~= player.Backpack and tool.Parent ~= player.Character, then table.remove it from order (use table.find and table.remove so slots shift down) and refresh.\n- hookBackpack(backpack): add all existing Tool children, and connect backpack.ChildAdded -> addTool and backpack.ChildRemoved -> removeTool.\n- hookCharacter(character): add existing Tool children and connect character.ChildAdded -> addTool, character.ChildRemoved -> removeTool.\n- Hook the current Backpack (player:WaitForChild('Backpack')) and the current character if it exists. On player.CharacterAdded: clear `order` (table.clear), then hook the new character and the new Backpack (player:WaitForChild('Backpack')) because the Backpack is recreated on respawn.\n- Equip: use Remotes = game:GetService('ReplicatedStorage'):WaitForChild('Remotes', 10) and its child Equip (RemoteEvent) found with WaitForChild('Equip', 10); if either is nil, warn and skip the equip wiring. pressSlot(i): local tool = order[i]; if tool then equipRemote:FireServer(tool) end.\n- Slot click: slot.Activated -> pressSlot(i).\n- Keys: UserInputService.InputBegan:Connect(function(input, gameProcessed) if gameProcessed then return end ... end). Map Enum.KeyCode.One, Two, Three, Four, Five, Six, Seven, Eight, Nine to slots 1..9 using a table.\nEquipping goes through the server only (FireServer). Only use real Roblox APIs.",
  "accept": "Creates exactly 9 slot TextButtons once inside a UIListLayout using LayoutOrder (no manual Position on slots); maps KeyCode One..Nine to slots with a gameProcessed check; tracks tools with Backpack/Character ChildAdded/ChildRemoved and uses table.remove so slots shift; re-hooks Backpack on CharacterAdded; fires the Equip remote with the tool instead of equipping locally; WaitForChild with timeout and nil handling",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t9",
  "role": "coder",
  "title": "GameUI Crafting panel module",
  "prompt": "Write ONE complete Roblox Luau ModuleScript named Crafting (child of the LocalScript GameUI). Output only the code in one ```lua block. Write the whole script, no placeholders.\n\nIt returns function(gui) where gui is a ScreenGui.\n\nContext: ReplicatedStorage.Recipes is a ModuleScript returning an array of {Name = string, Cost = {[materialName] = number}}, e.g. {Name='StoneAxe', Cost={Wood=3, Stone=3}}. The server replicates the player's materials as attributes named 'Mat_<name>' (e.g. 'Mat_Wood') on the LocalPlayer. The remote ReplicatedStorage.Remotes.Craft (RemoteEvent) takes one argument, the recipe name string. The server checks materials and does the crafting; the client only sends the request.\n\nUI:\n- A TextButton named 'CraftToggle' in gui: AnchorPoint Vector2.new(0,0.5), Position UDim2.new(0,16,0.5,0), Size UDim2.fromOffset(90,36), Text 'Craft (C)', Font Enum.Font.Gotham, TextSize 16.\n- A Frame named 'CraftPanel': AnchorPoint Vector2.new(0.5,0.5), Position UDim2.fromScale(0.5,0.5), Size UDim2.fromOffset(380,320), BackgroundColor3 Color3.fromRGB(25,25,25), Visible = false, with a UICorner. Inside: a TextLabel title 'Crafting' (top, height 36) and a ScrollingFrame named 'List' below it (Size UDim2.new(1,-16,1,-48), Position UDim2.fromOffset(8,40), BackgroundTransparency 1, CanvasSize UDim2.new(0,0,0,0), AutomaticCanvasSize Enum.AutomaticSize.Y) with a UIListLayout (SortOrder Enum.SortOrder.LayoutOrder, Padding UDim.new(0,6)). Do not set Position on the rows; use LayoutOrder.\n- Before building the rows, destroy every existing child of List that is not a UIListLayout, so no duplicates pile up. Build the rows ONCE (when the module starts), one per recipe: a Frame 'Row_<Name>' (Size UDim2.new(1,-8,0,52), LayoutOrder = index) with a TextLabel for '<Name>' plus the cost as text like 'Wood 3, Stone 3', and a TextButton 'CraftButton' with Text 'Craft' on the right.\n\nLogic:\n- Players.LocalPlayer. Get Recipes with require(ReplicatedStorage:WaitForChild('Recipes', 10)); if the WaitForChild result is nil, warn and return. Get the Craft remote with ReplicatedStorage:WaitForChild('Remotes', 10) then :WaitForChild('Craft', 10); if nil, warn and return.\n- canCraft(recipe): for each name, amount in pairs(recipe.Cost) the value (player:GetAttribute('Mat_' .. name) or 0) must be >= amount.\n- refresh(): for each row set the CraftButton to a normal color when craftable and gray (Color3.fromRGB(90,90,90)) when not; set Active = craftable. Call refresh() once and again on player.AttributeChanged.\n- CraftButton.Activated -> craftRemote:FireServer(recipe.Name) (only if canCraft).\n- CraftToggle.Activated toggles CraftPanel.Visible. UserInputService.InputBegan: if not gameProcessed and input.KeyCode == Enum.KeyCode.C then toggle too.\nOnly use real Roblox APIs and valid Enum values.",
  "accept": "Creates CraftToggle button and a CraftPanel with a ScrollingFrame list using UIListLayout and LayoutOrder (no manual Position on rows); clears old children before building rows and builds them once; enables each Craft button only when player attributes 'Mat_<name>' meet the cost and refreshes on player.AttributeChanged; fires the Craft remote with the recipe name only; toggles on button and on KeyCode.C with a gameProcessed check; WaitForChild with timeout and nil handling",
  "deps": [],
  "skills": []
 },
 {
  "ref": "t10",
  "role": "planner",
  "title": "Studio apply checklist",
  "prompt": "Write a short step-by-step checklist (markdown) for placing 10 Roblox scripts into an EMPTY Studio place named Re:islands. The module ServerScriptService.Modules.ProfileStore already exists and must not be touched. Output a table with the columns: Name | Class | Parent (full path) and then a numbered list of steps.\n\nThe scripts are:\n1. Setup - Script - ServerScriptService\n2. Recipes - ModuleScript - ReplicatedStorage\n3. PlayerData - ModuleScript - ServerScriptService.Modules (next to ProfileStore)\n4. CraftingServer - Script - ServerScriptService\n5. IslandServer - Script - ServerScriptService\n6. GameUI - LocalScript - StarterPlayer.StarterPlayerScripts\n7. Coins - ModuleScript - child of the GameUI LocalScript\n8. Hotbar - ModuleScript - child of the GameUI LocalScript\n9. Crafting - ModuleScript - child of the GameUI LocalScript\n(The folders ReplicatedStorage.Remotes and Workspace.Islands are created at runtime by Setup; do not create them by hand.)\n\nAfter the table, add a section 'Test in Studio' with 6 steps: press Play, check the Output window for warnings, check that Workspace.Islands gets an Island_<UserId> model, check the Coins label shows 100, check that crafting WoodPickaxe puts a tool in the hotbar slot 1 and lowers Wood to 15, check that pressing 1 equips it. Keep it under 40 lines.",
  "accept": "Table lists all 9 scripts with correct class and parent paths, including ProfileStore left untouched and the three modules as children of GameUI; notes that Remotes and Islands are created at runtime; includes a 6-step Studio test section covering coins 100, island model, craft WoodPickaxe (Wood 20 to 15) and key 1 equip",
  "deps": [],
  "skills": []
 }
]
```
