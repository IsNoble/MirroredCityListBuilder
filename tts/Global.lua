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

  -- Filled in by buildSides() from BOARD and SPAWN: card rows just outside the battlefield frame, model rows just inside it.
  sides = {},

  cardScale = { x = 1.6, y = 1.0, z = 1.6 },   -- Notecard scale: text scales with the card, so bigger = more readable
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
-- centerX/centerZ: middle of the battlefield frame; widthX/depthZ: frame size in inches (1 TTS unit = 1");
-- boardWidthX/boardDepthZ: the physical board the staging zones sit beyond.
BOARD = { centerX = 12.65, centerZ = 0, surfaceY = 1.0, widthX = 44, depthZ = 30, boardWidthX = 72, boardDepthZ = 48 }

-- unitId -> object JSON (string). build-save.js replaces this line; keep it on one line.
MODEL_LIBRARY = {}

-- Seat colour on each side of the board. build-save.js replaces this line from the map profile's seats.
SEATS = { south = "Red", north = "Blue" }

-- Tracker rows (label, min, max, colour). build-save.js replaces this line from the map profile.
TRACKER = { rows = { { label = "ROUND", min = 1, max = 10, color = "White" } } }

-- Current tracker values by row index; saved with the table.
trackerValues = {}

-- Spacing of imported cards and models, measured outward from the board edge into the player's staging zone.
-- build-save.js replaces this line from the map profile.
SPAWN = { cardStepX = 4.8, cardRowGap = 3.4, cardOffset = 3.4, modelStepX = 2.3, modelRowGap = 2.6, modelOffset = 10.4, inset = 2.0 }

-- South = negative Z, North = positive Z. Each side's zone lies beyond its board edge, as wide as the board:
-- card rows nearest the board, model rows behind them, both stepping away from the board.
function buildSides()
  local y = BOARD.surfaceY + 1.5
  local edge = BOARD.boardDepthZ / 2
  local usable = BOARD.boardWidthX - 2 * SPAWN.inset
  local cardsPerRow  = math.max(1, math.floor(usable / SPAWN.cardStepX))
  local modelsPerRow = math.max(1, math.floor(usable / SPAWN.modelStepX))
  local cardSpan  = (cardsPerRow - 1) * SPAWN.cardStepX
  local modelSpan = (modelsPerRow - 1) * SPAWN.modelStepX
  CONFIG.sides = {
    south = { label = SEATS.south, rotY = 0,
      cards  = { x = BOARD.centerX - cardSpan / 2,  y = y, z = BOARD.centerZ - edge - SPAWN.cardOffset,  stepX = SPAWN.cardStepX,  perRow = cardsPerRow,  stepZ = -SPAWN.cardRowGap },
      models = { x = BOARD.centerX - modelSpan / 2, y = y, z = BOARD.centerZ - edge - SPAWN.modelOffset, stepX = SPAWN.modelStepX, perRow = modelsPerRow, stepZ = -SPAWN.modelRowGap } },
    north = { label = SEATS.north, rotY = 180,
      cards  = { x = BOARD.centerX + cardSpan / 2,  y = y, z = BOARD.centerZ + edge + SPAWN.cardOffset,  stepX = -SPAWN.cardStepX,  perRow = cardsPerRow,  stepZ =  SPAWN.cardRowGap },
      models = { x = BOARD.centerX + modelSpan / 2, y = y, z = BOARD.centerZ + edge + SPAWN.modelOffset, stepX = -SPAWN.modelStepX, perRow = modelsPerRow, stepZ =  SPAWN.modelRowGap } },
  }
end

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------
rosterText = ""          -- what is currently in the paste box
library = {}             -- unitId -> override bag object

function onLoad(saved)
  if saved ~= nil and saved ~= "" then
    local ok, st = pcall(function() return JSON.decode(saved) end)
    if ok and type(st) == "table" and type(st.trackerValues) == "table" then trackerValues = st.trackerValues end
  end
  buildSides()
  refreshLibrary()
  setupStations()
  Wait.time(function() setStatus("Ready. " .. countLibrary() .. " unit models available.") end, 1)
end

function onSave()
  return JSON.encode({ trackerValues = trackerValues })
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

function mc_openPanel(obj, playerColor)
  UI.setAttribute("mcPanel", "active", "true")
end

function mc_closePanel(player, value, id)
  UI.setAttribute("mcPanel", "active", "false")
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
-- Button width / height units per table inch on a scale-1 object (measured: a width of 11000 drew 16.5" wide).
BTN_PER_INCH = 667

-- Buttons on a 1 x 1 pad, sizes in inches. The pad is read from the south seat, the same way as the
-- 3D text labels, hence the 180 degree rotation (which also mirrors x, so dx is negated).
function stationButton(obj, label, fn, dx, dz, widthIn, tooltip)
  obj.createButton({
    label = label, click_function = fn, function_owner = Global,
    position = { -dx, 0.6, -dz }, rotation = { 0, 180, 0 }, scale = { 1, 1, 1 },
    width = widthIn * BTN_PER_INCH, height = 1.6 * BTN_PER_INCH, font_size = 380,
    color = { 0.17, 0.23, 0.29 }, font_color = { 0.94, 0.94, 0.94 }, tooltip = tooltip or "",
  })
end

-- Quick-reference slab text (rulebook p.12-13). One entry per line; "" is a blank line.
REFERENCE = {
  "ROUND SEQUENCE",
  "1  Start Phase: generate Tempo, roll Initiative, draw Harrows, deploy Reinforcements",
  "2  Mystic Phase: resolve Rites (Spells and Prayers)",
  "3  Action Phase: alternate activations, spend Tempo; Activation token on each activated model",
  "4  End Phase: Morale, victory check, Recovery Checks for Stunned models, clean up",
  "",
  "TEMPO  (models in play, both warbands)",
  "16+ = 10      12-15 = 8      8-11 = 6      4-7 = 5      2-3 = 4",
  "+1 Leader on the battlefield    +1 behind on Victory Points    -2 warband Broken",
  "+1 per 2 models you are outnumbered by (max +3)",
  "",
  "RECOVERY CHECK  (2D6 per Stunned model, End Phase)",
  "2-6 Bleeding Out: 1 Mortal Wound      7-10 On Death's Door      11+ Recovered",
  "",
  "MEASURE from the base edge nearest the direction of travel (TTS ruler: left toolbar)",
}

function setupReference(obj)
  obj.clearButtons()
  local sx, sz = obj.getScale().x, obj.getScale().z
  local lineHeight, top, pad = 1.0, 0.9, 0.5
  local z = sz / 2 - top
  for _, line in ipairs(REFERENCE) do
    if line ~= "" then
      local heading = (line == line:upper()) and not line:match("^%d")
      obj.createButton({
        label = line, click_function = "mc_noop", function_owner = Global,
        position = { (sx / 2 - pad) / sx, 1.0, z / sz }, rotation = { 0, 180, 0 }, scale = { 1 / sx, 1, 1 / sz },
        width = 0, height = 0, font_size = heading and 300 or 240, alignment = 2,
        font_color = heading and { 0.10, 0.18, 0.22 } or { 0.08, 0.08, 0.08 },
      })
    end
    z = z - (line == "" and lineHeight * 0.5 or lineHeight)
  end
end

-- ---------------------------------------------------------------------------
-- Tracker: numbered buttons on the board; clicking one sets that row's value.
-- Button geometry on a flat object: the reader faces the object's front; local +x is the reader's LEFT,
-- local +z is the far edge (reader's top). Buttons are rotated 180 to read from the front.
-- ---------------------------------------------------------------------------
SEAT_RGB = { Red = { 0.85, 0.2, 0.2 }, Blue = { 0.25, 0.45, 0.9 }, White = { 0.92, 0.92, 0.92 }, Green = { 0.3, 0.7, 0.3 }, Yellow = { 0.9, 0.8, 0.2 } }
trackerCells = {}   -- row index -> { first = button index of cell 0, n = count }

function setupTracker(obj)
  obj.clearButtons()
  trackerCells = {}
  local sx, sz = obj.getScale().x, obj.getScale().z
  local rows = TRACKER.rows
  local rowGap = sz / #rows
  local labelW, pad = 6.5, 0.4
  local trackLen = sx - labelW - 2 * pad
  local index = 0
  for r, row in ipairs(rows) do
    local v = sz / 2 - rowGap * (r - 0.5)          -- local z of this row (top row first)
    local n = row.max - row.min + 1
    local cell = trackLen / n
    local rgb = SEAT_RGB[row.color] or SEAT_RGB.White
    -- row label on the reader's left (local +x)
    obj.createButton({
      label = row.label, click_function = "mc_noop", function_owner = Global,
      position = { (sx / 2 - pad - labelW / 2) / sx, 1.0, v / sz }, rotation = { 0, 180, 0 }, scale = { 1 / sx, 1, 1 / sz },
      width = 0, height = 0, font_size = 300, font_color = rgb,
    })
    index = index + 1
    trackerCells[r] = { first = index, n = n }
    if trackerValues[r] == nil then trackerValues[r] = row.min end
    for k = 0, n - 1 do
      local value = row.min + k
      local u = sx / 2 - pad - labelW - cell * (k + 0.5)   -- cells run to the reader's right = local -x
      local fn = "mc_track_" .. r .. "_" .. k
      _G[fn] = function(_, playerColor) setTrackerValue(obj, r, value) end
      obj.createButton({
        label = tostring(value), click_function = fn, function_owner = Global,
        position = { u / sx, 1.0, v / sz }, rotation = { 0, 180, 0 }, scale = { 1 / sx, 1, 1 / sz },
        width = (cell - 0.15) * BTN_PER_INCH, height = (rowGap - 0.6) * BTN_PER_INCH, font_size = cell < 1.2 and 300 or 380,
        color = { 0.42, 0.40, 0.36 }, font_color = { 0.95, 0.95, 0.95 }, tooltip = row.label .. " " .. value,
      })
      index = index + 1
    end
  end
  refreshTracker(obj)
end

function setTrackerValue(obj, r, value)
  trackerValues[r] = value
  refreshTracker(obj)
end

function refreshTracker(obj)
  for r, row in ipairs(TRACKER.rows) do
    local cells = trackerCells[r]
    if cells then
      local rgb = SEAT_RGB[row.color] or SEAT_RGB.White
      for k = 0, cells.n - 1 do
        local value = row.min + k
        local current = (trackerValues[r] == value)
        obj.editButton({ index = cells.first + k,
          color = current and rgb or { 0.42, 0.40, 0.36 },
          font_color = current and (row.color == "White" and { 0.1, 0.1, 0.1 } or { 1, 1, 1 }) or { 0.95, 0.95, 0.95 } })
      end
    end
  end
end

function setupStations()
  for _, obj in ipairs(getAllObjects()) do
    local note = obj.getGMNotes() or ""
    if note == "MC_TRACKER" then
      setupTracker(obj)
    elseif note == "MC_REFERENCE" then
      setupReference(obj)
    elseif note == "MC_STATION_IMPORT" then
      obj.clearButtons()
      stationButton(obj, "Import List", "mc_openPanel", 0, -1.6, 9.5, "Open the paste box for a roster from the list builder")
      stationButton(obj, "Clear " .. SEATS.south, "mc_clearSouth", -2.5, 1.4, 4.4, "Remove everything imported into the " .. SEATS.south .. " zone")
      stationButton(obj, "Clear " .. SEATS.north, "mc_clearNorth",  2.5, 1.4, 4.4, "Remove everything imported into the " .. SEATS.north .. " zone")
    end
  end
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
  local msg = string.format("%s: %d Stat Cards, %d models placed in the %s zone.", who, cardIndex, modelIndex, side.label)
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

-- A Stat Card is a Notecard: the title as its name, a compact stat block as its text. Stats, tags,
-- weapon and armor profiles, equipment names and rule names; no item rules text (see the rulebook).
function spawnCard(card, roster, pos, rotY, tags)
  spawnObject({
    type = "Notecard",
    position = pos,
    rotation = { 0, rotY, 0 },
    scale = CONFIG.cardScale,
    sound = false,
    callback_function = function(obj)
      obj.setName(cardTitle(card))
      obj.setDescription(cardFaceText(card))
      for _, t in ipairs(tags) do obj.addTag(t) end
      obj.setGMNotes(card.unitId or "")
    end,
  })
end

function mc_noop() end

-- Compact text for the card face. Headings use TTS rich-text colour tags.
function cardFaceText(card)
  local h = function(t) return "[e6c15a]" .. t .. "[-]" end
  local L = {}
  local function add(s) L[#L + 1] = s end
  add(statLine1(card.stats))
  add(statLine2(card.stats))
  if type(card.tags) == "table" and #card.tags > 0 then add("Tags: " .. table.concat(card.tags, ", ")) end
  if type(card.weapons) == "table" and #card.weapons > 0 then
    add(h("Weapons") .. "  Rng / Hit / Str / AP / Dmg")
    for _, w in ipairs(card.weapons) do add(weaponFaceLine(w)) end
  end
  if type(card.armor) == "table" and #card.armor > 0 then
    add(h("Armor") .. "  Armor / Injury / Mobility / Move")
    for _, a in ipairs(card.armor) do add(armorFaceLine(a)) end
  end
  if type(card.equipment) == "table" and #card.equipment > 0 then
    local names = {}
    for _, e in ipairs(card.equipment) do names[#names + 1] = tostring(e.name) end
    add(h("Equipment") .. " " .. table.concat(names, ", "))
  end
  local rules = {}
  for _, r in ipairs(card.special or {}) do rules[#rules + 1] = tostring(r.name) end
  if type(card.duty) == "table" then rules[#rules + 1] = "Duty: " .. tostring(card.duty.name) end
  for _, q in ipairs(card.quirks or {}) do rules[#rules + 1] = "Quirk: " .. tostring(q.name) end
  if #rules > 0 then add(h("Rules") .. " " .. table.concat(rules, "; ")) end
  if type(card.magic) == "table" and type(card.magic.entries) == "table" and #card.magic.entries > 0 then
    local names = {}
    for _, e in ipairs(card.magic.entries) do names[#names + 1] = tostring(e.name) .. (e.signature and "*" or "") end
    add(h(tostring(card.magic.label or "Spells")) .. " " .. table.concat(names, ", "))
  end
  if type(card.sellsword) == "table" then add(h("Sellsword") .. " retainer " .. tostring(card.sellsword.retainer) .. " lumens") end
  return table.concat(L, "\n")
end

function statLine1(st)
  st = st or {}
  local function v(k) local x = st[k]; if x == nil then return "-" end; return tostring(x) end
  return string.format("SPD %s   STR %s   TGH %s   WIL %s   HP %s", v("spd"), v("str"), v("tgh"), v("wil"), v("hp"))
end

function statLine2(st)
  st = st or {}
  local function v(k) local x = st[k]; if x == nil then return "-" end; return tostring(x) end
  return string.format("ATK %s   FGT %s   SHT %s   ARM %s   XP %s", v("atk"), v("fgt"), v("sht"), v("arm"), v("xp"))
end

function weaponFaceLine(w)
  local traits = ""
  if type(w.traits) == "table" and #w.traits > 0 then traits = "  [" .. table.concat(w.traits, ", ") .. "]" end
  return string.format("%s   %s / %s / %s / %s / %s%s", tostring(w.name), tostring(w.range), tostring(w.hit), tostring(w.str), tostring(w.ap), tostring(w.dmg), traits)
end

function armorFaceLine(a)
  local traits = ""
  if type(a.traits) == "table" and #a.traits > 0 then traits = "  [" .. table.concat(a.traits, ", ") .. "]" end
  return string.format("%s   %s / %s / %s / %s%s", tostring(a.name), tostring(a.armorValue), tostring(a.injurySave), tostring(a.mobility), tostring(a.moveCheck), traits)
end

function spawnModel(modelData, label, tooltip, tint, pos, rotY, tags)
  local function finish(obj)
    obj.setName(label)
    obj.setDescription(tooltip)
    obj.measure_movement = true   -- ruler while moving, for library models and fallback pawns alike
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

