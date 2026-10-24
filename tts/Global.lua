--[[
  Mirrored City — table script (Global)

  Paste the JSON produced by the list builder's "Export for TTS" button into the
  Import panel, pick a side, and one Notecard per Stat Card plus one model per
  miniature is spawned on that side.

  Models come from MODEL_LIBRARY (object JSON per unit id, embedded by
  build-save.js). A bag anywhere on the table whose GM Notes equal a unit id
  overrides the embedded model for that unit, so swapping a miniature in-game
  is: put a model in a bag, set the bag's GM Notes, press Rescan.

  Stations (objects with GM Notes MC_STATION_IMPORT / MC_STATION_CARDS) get
  their buttons in setupStations().
]]

CONFIG = {
  formatName       = "mirrored-city-tts",
  maxFormatVersion = 1,

  libraryTag = "MC_LIBRARY",   -- optional override bags carry this tag
  spawnedTag = "MC_SPAWNED",   -- everything the importer creates carries this tag
  customTag  = "MC_CUSTOM_CARD",

  -- Filled in by buildSides() from BOARD: card rows just outside the battlefield frame, model rows just inside it.
  sides = {},
  cardStepX = 4.8, cardRowGap = 3.4, cardOffset = 4.5,   -- cards start this far outside the frame edge
  modelStepX = 2.3, modelRowGap = 2.6, modelInset = 2.0, -- models start this far inside the frame edge

  cardScale = { x = 1.0, y = 1.0, z = 1.0 },
  pawnScale = { x = 0.8, y = 0.8, z = 0.8 },

  -- Tint for the fallback pawn, by warband id. Unknown warbands get grey.
  factionColors = {
    mercenary_companies   = { r = 0.62, g = 0.55, b = 0.35 },
    the_great_feast       = { r = 0.55, g = 0.30, b = 0.25 },
    order_of_the_last_sun = { r = 0.85, g = 0.70, b = 0.25 },
    the_lorathiir         = { r = 0.35, g = 0.60, b = 0.45 },
  },
}

-- Board geometry. build-save.js replaces this line from the map profile (tts/maps/<map>.json).
-- centerX/centerZ: middle of the battlefield frame; widthX/depthZ: frame size in inches (1 TTS unit = 1").
BOARD = { centerX = 12.65, centerZ = 0, surfaceY = 1.0, widthX = 44, depthZ = 30 }

-- Where the Card Creator puts new blank cards. build-save.js replaces this line from the map profile.
CARD_SPAWN = { x = -62, y = 2.5, z = -6, stepX = 4.8, perRow = 8, stepZ = -3.4, rotY = 0 }

-- unitId -> object JSON (string). build-save.js replaces this line; keep it on one line.
MODEL_LIBRARY = {}

-- South = negative Z, North = positive Z. Cards outside the frame, models inside.
function buildSides()
  local y = BOARD.surfaceY + 1.5
  local hx, hz = BOARD.widthX / 2, BOARD.depthZ / 2
  local cardsPerRow  = math.max(1, math.floor(BOARD.widthX / CONFIG.cardStepX))
  local modelsPerRow = math.max(1, math.floor((BOARD.widthX - 2 * CONFIG.modelInset) / CONFIG.modelStepX))
  local cardSpan  = (cardsPerRow - 1) * CONFIG.cardStepX
  local modelSpan = (modelsPerRow - 1) * CONFIG.modelStepX
  CONFIG.sides = {
    south = { label = "South", rotY = 0,
      cards  = { x = BOARD.centerX - cardSpan / 2,  y = y, z = BOARD.centerZ - hz - CONFIG.cardOffset, stepX = CONFIG.cardStepX,  perRow = cardsPerRow,  stepZ = -CONFIG.cardRowGap },
      models = { x = BOARD.centerX - modelSpan / 2, y = y, z = BOARD.centerZ - hz + CONFIG.modelInset, stepX = CONFIG.modelStepX, perRow = modelsPerRow, stepZ =  CONFIG.modelRowGap } },
    north = { label = "North", rotY = 180,
      cards  = { x = BOARD.centerX + cardSpan / 2,  y = y, z = BOARD.centerZ + hz + CONFIG.cardOffset, stepX = -CONFIG.cardStepX,  perRow = cardsPerRow,  stepZ =  CONFIG.cardRowGap },
      models = { x = BOARD.centerX + modelSpan / 2, y = y, z = BOARD.centerZ + hz - CONFIG.modelInset, stepX = -CONFIG.modelStepX, perRow = modelsPerRow, stepZ = -CONFIG.modelRowGap } },
  }
end

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------
rosterText = ""          -- what is currently in the paste box
library = {}             -- unitId -> override bag object

function onLoad(saved)
  buildSides()
  refreshLibrary()
  setupStations()
  Wait.time(function() setStatus("Ready. " .. countLibrary() .. " unit models available.") end, 1)
end

-- ---------------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------------
function refreshLibrary()
  library = {}
  for _, obj in ipairs(getAllObjects()) do
    if obj.type == "Bag" or obj.type == "Infinite" or obj.hasTag(CONFIG.libraryTag) then
      local id = trim(obj.getGMNotes() or "")
      -- Any bag whose GM Notes look like a unit id (e.g. mc_captain) overrides the embedded model.
      if id ~= "" and id:sub(1, 3) ~= "MC_" and id:match("^[a-z]+_[a-z_]+$") then library[id] = obj end
    end
  end
end

function countLibrary()
  local ids = {}
  for id, _ in pairs(MODEL_LIBRARY) do ids[id] = true end
  for id, _ in pairs(library) do ids[id] = true end
  local n = 0
  for _ in pairs(ids) do n = n + 1 end
  return n
end

-- Returns a model data table (for spawnObjectData) or nil.
function libraryModelData(unitId)
  local bag = library[unitId]
  if bag ~= nil then
    local data = bag.getData()
    if data ~= nil and data.ContainedObjects ~= nil and #data.ContainedObjects > 0 then
      return data.ContainedObjects[1]
    end
  end
  local js = MODEL_LIBRARY[unitId]
  if js == nil or js == "" then return nil end
  local ok, data = pcall(function() return JSON.decode(js) end)
  if ok and type(data) == "table" then return data end
  return nil
end

-- ---------------------------------------------------------------------------
-- UI handlers (called from Global.xml and station buttons)
-- ---------------------------------------------------------------------------
function isTrue(v)
  return tostring(v):lower() == "true"
end

function mc_onRosterText(player, value, id)
  rosterText = value or ""
end

function mc_togglePanel(player, value, id)
  local active = UI.getAttribute("mcPanel", "active")
  UI.setAttribute("mcPanel", "active", isTrue(active) and "false" or "true")
end

function mc_openPanel(obj, playerColor)
  UI.setAttribute("mcPanel", "active", "true")
end

function mc_importSouth(player) importRoster("south", player) end
function mc_importNorth(player) importRoster("north", player) end
function mc_clearSouth(player) clearSide("south") end
function mc_clearNorth(player) clearSide("north") end
function mc_clearAll(player) clearSide(nil) end
function mc_refreshLibrary(player)
  refreshLibrary()
  setStatus(countLibrary() .. " unit models available.")
end

function setStatus(msg)
  UI.setAttribute("mcStatus", "text", msg)
end

-- ---------------------------------------------------------------------------
-- Stations: physical buttons on the table
-- ---------------------------------------------------------------------------
-- Buttons on a 1 x 1 pad: width/height are in 1/1000 of a table unit. The pad is read from the
-- south seat, the same way as the 3D text labels, hence the 180 degree rotation.
function stationButton(obj, label, fn, dx, dz, width, tooltip)
  obj.createButton({
    label = label, click_function = fn, function_owner = Global,
    position = { -dx, 0.6, -dz }, rotation = { 0, 180, 0 }, scale = { 1, 1, 1 },
    width = width, height = 1100, font_size = 380,
    color = { 0.17, 0.23, 0.29 }, font_color = { 0.94, 0.94, 0.94 }, tooltip = tooltip or "",
  })
end

function setupStations()
  for _, obj in ipairs(getAllObjects()) do
    local note = obj.getGMNotes() or ""
    if note == "MC_STATION_IMPORT" then
      obj.clearButtons()
      stationButton(obj, "Import Warband", "mc_openPanel", 0, -4.0, 11000, "Open the paste box for a roster from the list builder")
      stationButton(obj, "Clear South",    "mc_clearSouth", -2.9, -1.0, 5200, "Remove everything imported on the south side")
      stationButton(obj, "Clear North",    "mc_clearNorth",  2.9, -1.0, 5200, "Remove everything imported on the north side")
      stationButton(obj, "Rescan models",  "mc_refreshLibrary", 0, 2.0, 11000, "Pick up override bags added in-game")
    elseif note == "MC_STATION_CARDS" then
      obj.clearButtons()
      stationButton(obj, "New Stat Card",  "mc_newCard", 0, -1.6, 11000, "Spawn a blank Mirrored City Stat Card to fill in by hand")
      stationButton(obj, "Clear blank cards", "mc_clearCustomCards", 0, 1.6, 11000, "Remove the cards made here")
    end
  end
end

-- Card Creator: a blank Notecard with the Stat Card layout, laid out in a grid near the station.
function mc_newCard(obj, playerColor)
  local n = #getObjectsWithTag(CONFIG.customTag)
  local pos = gridPos(CARD_SPAWN, n)
  spawnObject({
    type = "Notecard", position = pos, rotation = { 0, CARD_SPAWN.rotY, 0 }, scale = CONFIG.cardScale, sound = false,
    callback_function = function(card)
      card.setName("New Stat Card  —  HERO, 0 lumens")
      card.setDescription(blankCardBody())
      card.addTag(CONFIG.customTag)
    end,
  })
end

function mc_clearCustomCards(obj, playerColor)
  local removed = 0
  for _, o in ipairs(getObjectsWithTag(CONFIG.customTag)) do destroyObject(o); removed = removed + 1 end
  if removed > 0 then broadcastToAll("Removed " .. removed .. " blank cards.", {0.8, 1, 0.8}) end
end

function blankCardBody()
  local h = function(t) return "[e6c15a]" .. t .. "[-]" end
  return table.concat({
    h("Stats"),
    "SPD -   STR -   TGH -   WIL -   HP -",
    "ATK -   FGT -   SHT -   ARM -   XP -",
    "Tags: ",
    h("Weapons"), "- : R -, Hit -, Str -, AP -, Dmg -",
    h("Armor"), "-",
    h("Equipment"), "-",
    h("Special Rules"), "-",
    "", "(Hover the card and press the gear icon to edit the name and this text.)",
  }, "\n")
end

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------
function parseRoster(text)
  text = trim(text or "")
  if text == "" then return nil, "Paste the roster JSON first." end
  local ok, data = pcall(function() return JSON.decode(text) end)
  if not ok or type(data) ~= "table" then return nil, "That is not valid JSON." end
  if data.format ~= CONFIG.formatName then
    return nil, "Not a Mirrored City TTS export (format = " .. tostring(data.format) .. ")."
  end
  local ver = tonumber(data.formatVersion) or 0
  if ver > CONFIG.maxFormatVersion then
    return nil, "Export format v" .. ver .. " is newer than this table understands (v" .. CONFIG.maxFormatVersion .. "). Update the mod."
  end
  if type(data.cards) ~= "table" or #data.cards == 0 then return nil, "The roster has no Stat Cards." end
  return data, nil
end

function importRoster(sideKey, player)
  local data, err = parseRoster(rosterText)
  if err then setStatus(err); broadcastToAll(err, {1, 0.6, 0.6}); return end

  local side = CONFIG.sides[sideKey]
  clearSide(sideKey)
  refreshLibrary()

  local roster = data.roster or {}
  local warbandId = roster.warbandId or ""
  local tint = CONFIG.factionColors[warbandId] or { r = 0.6, g = 0.6, b = 0.6 }
  local sideTag = "MC_SIDE_" .. sideKey

  local cardIndex = 0
  local modelIndex = 0
  local missing = {}

  for _, card in ipairs(data.cards) do
    local cpos = gridPos(side.cards, cardIndex)
    cardIndex = cardIndex + 1
    spawnCard(card, roster, cpos, side.rotY, { CONFIG.spawnedTag, sideTag })

    local count = tonumber(card.count) or 1
    if count < 1 then count = 1 end
    local modelData = libraryModelData(card.unitId or "")
    if modelData == nil then missing[#missing + 1] = tostring(card.unit or card.unitId) end
    for m = 1, count do
      local mpos = gridPos(side.models, modelIndex)
      modelIndex = modelIndex + 1
      local label = modelLabel(card, m, count)
      spawnModel(modelData, label, cardTooltip(card), tint, mpos, side.rotY, { CONFIG.spawnedTag, sideTag })
    end
  end

  local who = roster.name
  if who == nil or who == "" then who = roster.warband or "Warband" end
  local msg = string.format("%s: %d Stat Cards, %d models placed %s.", who, cardIndex, modelIndex, side.label)
  if #missing > 0 then
    msg = msg .. " No model for: " .. table.concat(uniq(missing), ", ") .. " (pawns used)."
  end
  setStatus(msg)
  broadcastToAll(msg, {0.8, 1, 0.8})
end

function gridPos(g, i)
  local col = i % g.perRow
  local row = math.floor(i / g.perRow)
  return { x = g.x + col * g.stepX, y = g.y, z = g.z + row * g.stepZ }
end

function spawnCard(card, roster, pos, rotY, tags)
  spawnObject({
    type = "Notecard",
    position = pos,
    rotation = { 0, rotY, 0 },
    scale = CONFIG.cardScale,
    sound = false,
    callback_function = function(obj)
      obj.setName(cardTitle(card))
      obj.setDescription(cardBody(card, roster))
      for _, t in ipairs(tags) do obj.addTag(t) end
      obj.setGMNotes(card.unitId or "")
      obj.createButton({
        label = "Full", click_function = "mc_toggleInfo", function_owner = Global,
        position = { 0, 0.2, 1.25 }, rotation = { 0, 0, 0 }, scale = { 0.5, 0.5, 0.5 },
        width = 500, height = 160, font_size = 90, tooltip = "Show / hide the full card",
      })
      obj.UI.setXml(cardPanelXml(card, roster))
    end,
  })
end

function spawnModel(modelData, label, tooltip, tint, pos, rotY, tags)
  local function finish(obj)
    obj.setName(label)
    obj.setDescription(tooltip)
    for _, t in ipairs(tags) do obj.addTag(t) end
  end
  if modelData ~= nil then
    spawnObjectData({
      data = modelData,
      position = pos,
      rotation = { 0, rotY, 0 },
      callback_function = finish,
    })
  else
    spawnObject({
      type = "PlayerPawn",
      position = pos,
      rotation = { 0, rotY, 0 },
      scale = CONFIG.pawnScale,
      sound = false,
      callback_function = function(obj)
        obj.setColorTint(tint)
        finish(obj)
      end,
    })
  end
end

function clearSide(sideKey)
  local removed = 0
  for _, obj in ipairs(getObjectsWithTag(CONFIG.spawnedTag)) do
    if sideKey == nil or obj.hasTag("MC_SIDE_" .. sideKey) then
      destroyObject(obj)
      removed = removed + 1
    end
  end
  if removed > 0 then
    setStatus("Cleared " .. removed .. " objects" .. (sideKey and (" (" .. CONFIG.sides[sideKey].label .. ")") or "") .. ".")
  end
end

function mc_toggleInfo(obj, playerColor)
  local active = obj.UI.getAttribute("mcCard", "active")
  obj.UI.setAttribute("mcCard", "active", isTrue(active) and "false" or "true")
end

-- ---------------------------------------------------------------------------
-- Text rendering
-- ---------------------------------------------------------------------------
function cardTitle(card)
  local kind = tostring(card.kind or "")
  local name = tostring(card.name or card.unit or "?")
  local cost = tostring(card.cost or "?") .. (card.costVariable and "+" or "")
  local t = name
  if card.name ~= nil and card.unit ~= nil and card.name ~= card.unit then t = name .. " (" .. tostring(card.unit) .. ")" end
  if (tonumber(card.count) or 1) > 1 then t = t .. " x" .. tostring(card.count) end
  return t .. "  —  " .. kind .. ", " .. cost .. " lumens"
end

function modelLabel(card, m, count)
  local name = tostring(card.name or card.unit or "?")
  if count > 1 then name = name .. " " .. m .. "/" .. count end
  return name
end

function statLine(st)
  st = st or {}
  local function v(k) local x = st[k]; if x == nil then return "-" end; return tostring(x) end
  return string.format("SPD %s  STR %s  TGH %s  WIL %s  HP %s\nATK %s  FGT %s  SHT %s  ARM %s  XP %s",
    v("spd"), v("str"), v("tgh"), v("wil"), v("hp"), v("atk"), v("fgt"), v("sht"), v("arm"), v("xp"))
end

function weaponLine(w)
  local traits = ""
  if type(w.traits) == "table" and #w.traits > 0 then traits = "  [" .. table.concat(w.traits, ", ") .. "]" end
  return string.format("%s: R %s, Hit %s, Str %s, AP %s, Dmg %s%s",
    tostring(w.name), tostring(w.range), tostring(w.hit), tostring(w.str), tostring(w.ap), tostring(w.dmg), traits)
end

function armorLine(a)
  local traits = ""
  if type(a.traits) == "table" and #a.traits > 0 then traits = "  [" .. table.concat(a.traits, ", ") .. "]" end
  return string.format("%s: Armor %s, Injury %s, Mobility %s, Move Check %s%s",
    tostring(a.name), tostring(a.armorValue), tostring(a.injurySave), tostring(a.mobility), tostring(a.moveCheck), traits)
end

-- Short tooltip used on the models (hover text).
function cardTooltip(card)
  local lines = {}
  lines[#lines + 1] = statLine(card.stats)
  if type(card.weapons) == "table" then
    for _, w in ipairs(card.weapons) do lines[#lines + 1] = weaponLine(w) end
  end
  if type(card.armor) == "table" and #card.armor > 0 then
    local names = {}
    for _, a in ipairs(card.armor) do names[#names + 1] = tostring(a.name) end
    lines[#lines + 1] = "Armor: " .. table.concat(names, ", ")
  end
  return table.concat(lines, "\n")
end

-- Full text of the card. `h` wraps section headings.
function cardText(card, roster, h)
  local L = {}
  local function add(s) L[#L + 1] = s end
  local function section(title, items, fmt)
    if type(items) ~= "table" or #items == 0 then return end
    add(h(title))
    for _, it in ipairs(items) do add(fmt(it)) end
  end

  add(h("Stats"))
  add(statLine(card.stats))
  if type(card.tags) == "table" and #card.tags > 0 then add("Tags: " .. table.concat(card.tags, ", ")) end

  section("Weapons", card.weapons, weaponLine)
  section("Armor", card.armor, armorLine)
  section("Equipment", card.equipment, function(e)
    return tostring(e.name) .. (e.rules and e.rules ~= "" and (": " .. tostring(e.rules)) or "")
  end)
  section("Special Rules", card.special, function(r) return tostring(r.name) .. ": " .. tostring(r.text) end)
  section("Wargear Rules", card.weaponRules, function(r) return tostring(r.name) .. ": " .. tostring(r.text) end)
  if type(card.armor) == "table" then
    for _, a in ipairs(card.armor) do
      if a.rules and a.rules ~= "" then add(tostring(a.name) .. ": " .. tostring(a.rules)) end
    end
  end
  if type(card.sellsword) == "table" then
    add(h("Sellsword"))
    add("Retainer " .. tostring(card.sellsword.retainer) .. " lumens after each battle. Fixed wargear: " ..
        table.concat(card.sellsword.fixedWargear or {}, ", "))
  end
  if type(card.duty) == "table" then
    add(h("Duty"))
    add(tostring(card.duty.name) .. " (" .. tostring(card.duty.cost) .. "): " .. tostring(card.duty.rules))
  end
  section("Quirks", card.quirks, function(q) return tostring(q.name) .. " (" .. tostring(q.cost) .. "): " .. tostring(q.rules) end)
  if type(card.magic) == "table" and type(card.magic.entries) == "table" and #card.magic.entries > 0 then
    add(h(tostring(card.magic.label or "Spells") .. " — " .. tostring(card.magic.list or "")))
    for _, e in ipairs(card.magic.entries) do
      local cost = "Power " .. tostring(e.powerCost)
      if e.empoweredPowerCost ~= nil then cost = cost .. " / Empowered " .. tostring(e.empoweredPowerCost) end
      local sig = e.signature and " (Signature)" or ""
      local tags = (type(e.tags) == "table" and #e.tags > 0) and ("  [" .. table.concat(e.tags, ", ") .. "]") or ""
      add(tostring(e.name) .. sig .. " — " .. cost .. tags)
      if e.effect and e.effect ~= "" then add("   " .. tostring(e.effect)) end
    end
  end
  if roster and (roster.warband or roster.archetype) then
    add(h("Warband"))
    add(tostring(roster.warband or "") .. " / " .. tostring(roster.archetype or ""))
  end
  return table.concat(L, "\n")
end

-- Notecard body: uses TTS rich-text colour tags.
function cardBody(card, roster)
  return cardText(card, roster, function(t) return "[e6c15a]" .. t .. "[-]" end)
end

-- Object-level XML panel with the full card, hidden until the Full button is pressed.
function cardPanelXml(card, roster)
  local body = xmlEscape(cardText(card, roster, function(t) return "<b>" .. t .. "</b>" end), true)
  local title = xmlEscape(cardTitle(card), false)
  return [[
<Panel id="mcCard" active="false" position="0 0 -140" rotation="0 0 0" width="520" height="640"
       color="#101820F0" outline="#E6C15A" outlineSize="2" padding="10 10 10 10">
  <VerticalLayout spacing="6" childForceExpandHeight="false">
    <Text fontSize="20" color="#E6C15A" fontStyle="Bold" alignment="UpperLeft" preferredHeight="34">]] .. title .. [[</Text>
    <VerticalScrollView preferredHeight="560" scrollSensitivity="30" color="#00000000">
      <Text fontSize="14" color="#F0F0F0" alignment="UpperLeft" resizeTextForBestFit="false">]] .. body .. [[</Text>
    </VerticalScrollView>
  </VerticalLayout>
</Panel>]]
end

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
function trim(s)
  return (tostring(s):gsub("^%s+", ""):gsub("%s+$", ""))
end

function uniq(list)
  local seen, out = {}, {}
  for _, v in ipairs(list) do
    if not seen[v] then seen[v] = true; out[#out + 1] = v end
  end
  return out
end

-- Escapes text for TTS XML UI. keepBold=true leaves <b>/</b> tags intact.
function xmlEscape(s, keepBold)
  s = tostring(s or "")
  s = s:gsub("&", "&amp;")
  if keepBold then
    s = s:gsub("<b>", "\1"):gsub("</b>", "\2")
  end
  s = s:gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;")
  if keepBold then
    s = s:gsub("\1", "<b>"):gsub("\2", "</b>")
  end
  return s
end
