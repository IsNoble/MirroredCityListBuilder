/*
  Builds a Mirrored City Tabletop Simulator save.

  Base map    : a cached Workshop save, chosen by --map <profile> (tts/maps/<profile>.json, default merchant-quarter)
  Models      : copied out of the cached "Ulthuan" Workshop save's faction tiles (model-map.json)
  Scripts     : Global.lua / Global.xml next to this file
  Output      : <TTS Saves dir>/MirroredCity/<saveName>.json (+ .png thumbnail)

  Run (no node on this machine; VS Code's Electron works as Node):
    ELECTRON_RUN_AS_NODE=1 "C:/Users/<you>/AppData/Local/Programs/Microsoft VS Code/Code.exe" tts/build-save.js [--map merchant-quarter] [--out <path.json>]

  Only the terrain and the Mirrored City additions survive: the map profile says which objects of the
  base save to keep. Everything else (rulebooks, sheets, scenarios, counters, setup kits) is dropped.
  Re-run whenever a profile, model-map.json, Global.lua or Global.xml change.
*/
const fs = require("fs");
const path = require("path");
const os = require("os");

const here = __dirname;
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };

const profileName = arg("--map", "merchant-quarter");
const profile = JSON.parse(fs.readFileSync(path.join(here, "maps", profileName + ".json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(here, "model-map.json"), "utf8"));
const luaSrc = fs.readFileSync(path.join(here, "Global.lua"), "utf8");
const xml = fs.readFileSync(path.join(here, "Global.xml"), "utf8");

const ttsDir = path.join(os.homedir(), "Documents", "My Games", "Tabletop Simulator");
const workshopDir = path.join(ttsDir, "Mods", "Workshop");
const savesDir = path.join(ttsDir, "Saves", "MirroredCity");
const outPath = arg("--out", path.join(savesDir, profile.saveName + ".json"));

const LIBRARY_TAG = "MC_LIBRARY";

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------
function loadWorkshop(id, title){
  const p = path.join(workshopDir, id + ".json");
  if (!fs.existsSync(p)) throw new Error(`${title} (Workshop ${id}) is not cached at ${p}. Subscribe and open it in TTS once.`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const base = loadWorkshop(profile.base.workshopId, profile.base.title);
const ulthuan = loadWorkshop(map.sources.ulthuan.workshopId, map.sources.ulthuan.title);

// ---------------------------------------------------------------------------
// Index the Ulthuan models: tile nickname -> model nickname -> object JSON
// (the models are stored as [[...json...]] long strings inside each faction tile's script)
// ---------------------------------------------------------------------------
const index = {};
for (const tile of ulthuan.ObjectStates){
  if (tile.Name !== "Custom_Tile" || !(tile.LuaScript || "").includes("loadModels")) continue;
  const s = tile.LuaScript; const byName = {}; let idx = 0;
  while (true){
    const a = s.indexOf("[[", idx); if (a < 0) break;
    const b = s.indexOf("]]", a + 2); if (b < 0) break;
    idx = b + 2;
    const body = s.slice(a + 2, b);
    if (!body.startsWith("{")) continue;
    let o; try { o = JSON.parse(body); } catch { continue; }
    const name = (o.Nickname || "").trim();
    if (name && !byName[name]) byName[name] = o;
  }
  index[tile.Nickname] = byName;
}

// ---------------------------------------------------------------------------
// GUIDs: fresh 6-hex ids that do not collide with anything in the base save
// ---------------------------------------------------------------------------
const used = new Set();
(function collect(list){ for (const o of list || []){ if (o.GUID) used.add(o.GUID); collect(o.ContainedObjects); for (const k in (o.States || {})) collect([o.States[k]]); } })(base.ObjectStates);
function guid(){ let g; do { g = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"); } while (used.has(g)); used.add(g); return g; }

function cleanModel(src, label){
  const o = JSON.parse(JSON.stringify(src));
  delete o.LuaScript; delete o.LuaScriptState; delete o.XmlUI; delete o.States; delete o.AttachedSnapPoints;
  delete o.ContainedObjects; delete o.GMNotes; delete o.Tags; delete o.AttachedDecals;
  o.GUID = guid(); o.Nickname = label; o.Description = ""; o.Locked = false;
  (function mm(x){ x.MeasureMovement = true; for (const c of x.ChildObjects || []) mm(c); })(o);   // ruler while moving, for every unit (the source mod is inconsistent)
  const t = o.Transform || {};
  o.Transform = { posX: 0, posY: 2, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: t.scaleX ?? 1, scaleY: t.scaleY ?? 1, scaleZ: t.scaleZ ?? 1 };
  return o;
}

const textTemplate = JSON.parse(JSON.stringify(base.ObjectStates.find(o => o.Name === "3DText") || { Name: "3DText", Text: {} }));
const handTemplate = JSON.parse(JSON.stringify(base.ObjectStates.find(o => o.Name === "HandTrigger") || { Name: "HandTrigger" }));
function label3d(text, x, z, color, size){
  const o = JSON.parse(JSON.stringify(textTemplate));
  o.GUID = guid(); o.Nickname = ""; o.Description = ""; o.GMNotes = "MC_LABEL"; o.Locked = true;
  delete o.LuaScript; delete o.LuaScriptState; delete o.XmlUI;
  o.Transform = { posX: x, posY: profile.board.surfaceY + 0.6, posZ: z, rotX: 90, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
  o.Text = { Text: text, colorstate: color, fontSize: size || 48 };
  return o;
}

// ---------------------------------------------------------------------------
// Prune the base map down to the terrain (profile.keep)
// ---------------------------------------------------------------------------
const K = profile.keep;
const tableNames = new Set(K.tableNames || []);
const dropNames = new Set(K.dropNames || []);
const dropGuids = new Set(Object.keys(K.dropGuids || {}).filter(k => k !== "_comment"));
const stripPatterns = Object.keys(K.stripUrlPatterns || {}).filter(k => k !== "_comment");
const refsDead = o => stripPatterns.some(p => JSON.stringify({ a: o.CustomMesh, b: o.CustomAssetbundle, c: o.CustomImage, d: o.CustomDecal }).includes(p));
let strippedChildren = 0, strippedDecals = 0, droppedByUrl = 0;
function stripDead(o){
  if (Array.isArray(o.ChildObjects)){ const n = o.ChildObjects.length; o.ChildObjects = o.ChildObjects.filter(c => !refsDead(c)); strippedChildren += n - o.ChildObjects.length; o.ChildObjects.forEach(stripDead); }
  if (Array.isArray(o.AttachedDecals)){ const n = o.AttachedDecals.length; o.AttachedDecals = o.AttachedDecals.filter(d => !refsDead(d)); strippedDecals += n - o.AttachedDecals.length; }
  for (const c of o.ContainedObjects || []) stripDead(c);
}
const kept = [], shelfBags = [];
for (const o of base.ObjectStates){
  const t = o.Transform, nick = (o.Nickname || "").trim();
  if (dropGuids.has(o.GUID)) continue;
  if (refsDead(o)) { droppedByUrl++; continue; }   // its own mesh / bundle / image is on the dead list
  if (K.guids && K.guids[o.GUID]) { kept.push(o); continue; }
  if (K.bags && K.bags[o.GUID]) { shelfBags.push(o); continue; }
  if (tableNames.has(nick)) { kept.push(o); continue; }
  const terrainType = o.Name === "Custom_Model" || o.Name === "Custom_Assetbundle";
  const b = K.playBox;
  const onBoard = t.posX >= b.xMin && t.posX <= b.xMax && t.posZ >= b.zMin && t.posZ <= b.zMax && t.posY > b.yMin;
  if (terrainType && onBoard && !dropNames.has(nick)) { kept.push(o); continue; }
}
const prunedCount = base.ObjectStates.length - kept.length - shelfBags.length;
kept.forEach(stripDead);

// Terrain shelf
const TS = profile.shelves.terrain;
shelfBags.forEach((o, i) => {
  delete o.LuaScript; delete o.LuaScriptState; delete o.XmlUI;
  o.Nickname = K.bags[o.GUID];
  o.Description = "Terrain library. Drag pieces out onto the table; put them back when done.";
  o.GMNotes = "MC_TERRAIN"; o.Locked = true;
  o.Transform = { posX: TS.x0 + i * TS.stepX, posY: TS.y, posZ: TS.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 0.8, scaleY: 0.8, scaleZ: 0.8 };
  kept.push(o);
});
base.ObjectStates = kept;
if (shelfBags.length) base.ObjectStates.push(label3d("Terrain library", TS.labelX, TS.z, { r: 0.9, g: 0.85, b: 0.7 }));

// ---------------------------------------------------------------------------
// Ground texture: a Custom_Tile laid on the board under the terrain (2 x 2 units at scale 1)
// ---------------------------------------------------------------------------
const B = profile.board, F = profile.battlefield, G = profile.ground;

// Width / height of a PNG or JPEG file, read from the header.
function imageSize(file){
  const b = fs.readFileSync(file);
  if (b.slice(1, 4).toString() === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xFF && b[1] === 0xD8){
    let i = 2;
    while (i < b.length){
      if (b[i] !== 0xFF) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  throw new Error(`Cannot read image size of ${file}`);
}

let groundAspect = G && G.imageAspect;
if (G && !G.imageUrl && G.imageFile){
  const abs = path.resolve(here, G.imageFile);
  if (!fs.existsSync(abs)) throw new Error(`ground.imageFile not found: ${abs}`);
  G.imageUrl = "file:///" + abs.replace(/\\/g, "/");
  const sz = imageSize(abs); groundAspect = sz.w / sz.h;
}
if (G && G.imageUrl){
  if (!groundAspect) throw new Error("ground.imageAspect (width / height) is required when the ground image is a remote URL.");
  // A Custom_Tile is 2 units deep at scale 1; its width at scale 1 is 2 * image aspect.
  base.ObjectStates.push({
    GUID: guid(), Name: "Custom_Tile", Nickname: "Ground", Description: "", GMNotes: "MC_GROUND",
    Transform: { posX: B.centerX, posY: B.surfaceY + (G.thickness || 0.1) / 2 - 0.1, posZ: B.centerZ, rotX: 0, rotY: 0, rotZ: 0,
                 scaleX: G.widthX / (2 * groundAspect), scaleY: 1, scaleZ: G.depthZ / 2 },
    ColorDiffuse: { r: 1, g: 1, b: 1 }, Locked: true, Grid: false, Snap: false, Tooltip: false, IgnoreFoW: true,
    CustomImage: { ImageURL: G.imageUrl, ImageSecondaryURL: "", ImageScalar: 1.0, WidthScale: 0.0,
                   CustomTile: { Type: 0, Thickness: G.thickness || 0.1, Stackable: false, Stretch: true } },
  });
}

// ---------------------------------------------------------------------------
// Battlefield frame (rulebook size), centred on the board
// ---------------------------------------------------------------------------
function bar(x, z, lenX, lenZ){
  return { GUID: guid(), Name: "BlockSquare", Nickname: "Battlefield edge", Description: `${F.widthX}" x ${F.depthZ}" battlefield`, GMNotes: "MC_FRAME",
    Transform: { posX: x, posY: B.surfaceY + 0.18, posZ: z, rotX: 0, rotY: 0, rotZ: 0, scaleX: lenX, scaleY: 0.06, scaleZ: lenZ },
    ColorDiffuse: F.frameColor, Locked: true, Grid: false, Snap: false, Tooltip: true, IgnoreFoW: true };
}
const hx = F.widthX / 2, hz = F.depthZ / 2, th = 0.25;
base.ObjectStates.push(
  bar(B.centerX, B.centerZ - hz, F.widthX + th, th),
  bar(B.centerX, B.centerZ + hz, F.widthX + th, th),
  bar(B.centerX - hx, B.centerZ, th, F.depthZ + th),
  bar(B.centerX + hx, B.centerZ, th, F.depthZ + th),
);

// ---------------------------------------------------------------------------
// Model library: embedded in the Lua as object JSON per unit id (no bags on the table)
// ---------------------------------------------------------------------------
const report = [];
let unitCount = 0, filled = 0;
const libEntries = [];
for (const [unitId, u] of Object.entries(map.units)){
  unitCount++;
  let status = "empty";
  if (u.tile && u.model){
    const src = (index[u.tile] || {})[u.model];
    if (src){
      const json = JSON.stringify(cleanModel(src, u.name));
      if (json.includes("]==]")) throw new Error(`model JSON for ${unitId} contains a Lua long-bracket terminator`);
      libEntries.push(`["${unitId}"] = [==[${json}]==]`);
      status = "ok"; filled++;
    } else status = `MISSING: "${u.model}" not found in tile "${u.tile}"`;
  }
  report.push(`${status === "ok" ? "  " : "!!"} ${unitId.padEnd(26)} ${status === "ok" ? u.model : status}${u.note ? "   (" + u.note + ")" : ""}`);
}
const libraryLua = `MODEL_LIBRARY = { ${libEntries.join(", ")} }`;

// ---------------------------------------------------------------------------
// Player seats: hand zones along the long edges
// ---------------------------------------------------------------------------
const seats = (profile.seats && profile.seats.list) || [];
for (const s of seats){
  const h = JSON.parse(JSON.stringify(handTemplate));
  h.GUID = guid(); h.Nickname = ""; h.Description = ""; h.GMNotes = "MC_SEAT"; h.Locked = true;
  delete h.LuaScript; delete h.LuaScriptState; delete h.XmlUI;
  h.FogColor = s.color; h.FogHidePointers = false; h.FogReverseHiding = false; h.FogSeethrough = false;
  h.Transform = { posX: s.x, posY: B.surfaceY + 1.0, posZ: s.z, rotX: 0, rotY: s.rotY, rotZ: 0, scaleX: s.widthX, scaleY: 5, scaleZ: s.depthZ };
  base.ObjectStates.push(h);
  // Visible seat: a coloured bar along the outer edge of the hand zone and a label, so the seat is obvious before anyone sits.
  const seatColors = { Red: { r: 0.85, g: 0.2, b: 0.2 }, Blue: { r: 0.25, g: 0.45, b: 0.9 }, Green: { r: 0.3, g: 0.7, b: 0.3 }, Yellow: { r: 0.9, g: 0.8, b: 0.2 },
                       White: { r: 0.9, g: 0.9, b: 0.9 }, Orange: { r: 0.95, g: 0.55, b: 0.15 }, Purple: { r: 0.6, g: 0.3, b: 0.8 }, Pink: { r: 0.95, g: 0.5, b: 0.75 } };
  const outer = s.z + Math.sign(s.z) * (s.depthZ / 2 + 0.3);
  const sb = bar(s.x, outer, s.widthX, 0.5); sb.ColorDiffuse = seatColors[s.color] || { r: 0.7, g: 0.7, b: 0.7 }; sb.Nickname = `${s.color} seat`; sb.Description = `${s.color} player's seat. Press the Sit button, or click the colour on the player list.`; sb.GMNotes = "MC_SEAT_BAR:" + s.color;
  sb.Transform.rotY = s.rotY; sb.Transform.scaleY = 0.3;
  base.ObjectStates.push(sb);
  const lbl = label3d(`${s.color.toUpperCase()} PLAYER`, s.x, s.z, seatColors[s.color] || { r: 0.9, g: 0.9, b: 0.9 }, 64);
  lbl.Transform.rotY = s.rotY; base.ObjectStates.push(lbl);

  // Staging zone for this side: beyond the board edge, as wide as the board. Imported cards fill the
  // rows nearest the board, models the rows behind them.
  const SP = profile.spawn, dir = Math.sign(s.z) || 1, edge = B.depthZ / 2, zoneColor = seatColors[s.color] || { r: 0.75, g: 0.65, b: 0.4 };
  const near = edge + 1.0;
  const far  = edge + SP.modelOffset + (SP.modelRows - 1) * SP.modelRowGap + 1.6;
  const cz = B.centerZ + dir * (near + far) / 2, d = far - near, w = B.widthX;
  const edges = [ bar(B.centerX, cz - d / 2, w + th, th), bar(B.centerX, cz + d / 2, w + th, th), bar(B.centerX - w / 2, cz, th, d + th), bar(B.centerX + w / 2, cz, th, d + th) ];
  for (const e of edges){ e.ColorDiffuse = zoneColor; e.Nickname = `${s.color} warband zone`; e.Description = `${s.color}'s imported warband appears here: cards nearest the board, models behind.`; e.GMNotes = "MC_ZONE"; e.Transform.scaleY = 0.05; e.Transform.posY = B.surfaceY + 0.16; base.ObjectStates.push(e); }
  const l = label3d(`${s.color.toUpperCase()} WARBAND`, B.centerX - dir * (w / 2 - 7), B.centerZ + dir * (far - 1.6), zoneColor, 40); l.Transform.rotY = s.rotY; base.ObjectStates.push(l);
}

// ---------------------------------------------------------------------------
// Measuring sticks
// ---------------------------------------------------------------------------
const MSK = profile.tools && profile.tools.measuringSticks;
if (MSK){
  MSK.lengths.forEach((len, i) => {
    base.ObjectStates.push({ GUID: guid(), Name: "BlockSquare", Nickname: `${len}" measuring stick`, Description: `Exactly ${len} inch${len === 1 ? "" : "es"} long. TTS's ruler tool (left toolbar) measures any distance.`, GMNotes: "MC_TOOL",
      Transform: { posX: MSK.x + i * MSK.stepX, posY: B.surfaceY + 0.3, posZ: MSK.z, rotX: 0, rotY: MSK.rotY || 0, rotZ: 0, scaleX: len, scaleY: 0.25, scaleZ: 0.7 },
      ColorDiffuse: i % 2 ? { r: 0.85, g: 0.8, b: 0.6 } : { r: 0.6, g: 0.5, b: 0.35 }, Locked: false, Grid: false, Snap: false, Tooltip: true, MeasureMovement: true });
  });
}

// ---------------------------------------------------------------------------
// Stations: the free area left of the board, cut in two, each with an outline, a label and a button pad
// ---------------------------------------------------------------------------
const ST = profile.stations;
if (ST){
  const A = ST.area, dim = { r: 0.55, g: 0.5, b: 0.42 };
  const areaBars = (zMin, zMax) => {
    const cx = (A.xMin + A.xMax) / 2, cz = (zMin + zMax) / 2, w = A.xMax - A.xMin, d = zMax - zMin;
    return [ bar(cx, zMin, w + th, th), bar(cx, zMax, w + th, th), bar(A.xMin, cz, th, d + th), bar(A.xMax, cz, th, d + th) ];
  };
  const pad = (note, label, p, labelZ) => {
    base.ObjectStates.push(label3d(label, (A.xMin + A.xMax) / 2, labelZ, { r: 0.9, g: 0.85, b: 0.7 }, ST.labelSize || 72));
    base.ObjectStates.push({ GUID: guid(), Name: "BlockSquare", Nickname: label, Description: "Mirrored City station. The buttons are created by the table script.", GMNotes: note,
      Transform: { posX: p.x, posY: B.surfaceY + 0.12, posZ: p.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 0.02, scaleZ: 1 },
      ColorDiffuse: B.tableTop ? B.tableTop.color : { r: 0.07, g: 0.07, b: 0.08 }, Locked: true, Grid: false, Snap: false, Tooltip: false });
  };
  // One station fills the area; two split it north / south.
  const stations = [["MC_STATION_IMPORT", ST.import], ["MC_STATION_CARDS", ST.cards]].filter(([, s]) => s);
  const d = (A.zMax - A.zMin) / stations.length;
  stations.forEach(([note, s], i) => {
    const zMax = A.zMax - i * d, zMin = zMax - d;
    for (const b of areaBars(zMin, zMax)){ b.ColorDiffuse = dim; b.Nickname = "Station edge"; b.Description = ""; b.GMNotes = "MC_STATION_EDGE"; base.ObjectStates.push(b); }
    pad(note, s.label, s.pad, zMax - 2.5);
  });
}

// ---------------------------------------------------------------------------
// Mirrored City extras: token dispensers, Tempo / VP counters, quick-reference slab
// ---------------------------------------------------------------------------
const EX = profile.extras;
if (EX && EX.tokens){
  const TK = EX.tokens;
  const tokenScript = `function onLoad()
  self.createButton({ label = self.getGMNotes(), click_function = "noop", function_owner = self,
    position = { 0, 0.25, 0 }, rotation = { 0, 180, 0 }, width = 0, height = 0, font_size = 180, font_color = { 0.05, 0.05, 0.05 } })
end
function noop() end`;
  base.ObjectStates.push(label3d(TK.label || "TOKENS", TK.x0 + ((Math.min(TK.perRow, TK.list.length) - 1) * TK.stepX) / 2, TK.z0 + 2.6, { r: 0.9, g: 0.85, b: 0.7 }, 40));
  TK.list.forEach((tk, i) => {
    const x = TK.x0 + (i % TK.perRow) * TK.stepX, z = TK.z0 + Math.floor(i / TK.perRow) * TK.stepZ;
    const token = { GUID: guid(), Name: "Checker_white", Nickname: tk.name, Description: tk.name + " token", GMNotes: tk.short,
      Transform: { posX: x, posY: B.surfaceY + 1, posZ: z, rotX: 0, rotY: 0, rotZ: 0, scaleX: TK.scale, scaleY: TK.scale, scaleZ: TK.scale },
      ColorDiffuse: tk.color, Locked: false, Grid: false, Snap: true, Tooltip: true, LuaScript: tokenScript };
    base.ObjectStates.push({ GUID: guid(), Name: "Infinite_Bag", Nickname: tk.name + " tokens", Description: "Drag a token out. The bag never empties.", GMNotes: "MC_TOKEN_BAG",
      Transform: { posX: x, posY: B.surfaceY + 0.6, posZ: z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 0.8, scaleY: 0.8, scaleZ: 0.8 },
      ColorDiffuse: tk.color, Locked: true, Grid: false, Snap: false, Tooltip: true, Bag: { Order: 0 }, ContainedObjects: [token] });
  });
}
if (EX && EX.counters){
  for (const s of seats){
    const dir = Math.sign(s.z) || 1;
    EX.counters.list.forEach((name, i) => {
      base.ObjectStates.push({ GUID: guid(), Name: "Counter", Nickname: `${s.color} ${name}`, Description: `${s.color} player's ${name}. Click the arrows, or scroll on it.`, GMNotes: "MC_COUNTER",
        Transform: { posX: EX.counters.x + i * EX.counters.stepX, posY: B.surfaceY + 0.8, posZ: s.z - dir * 6.5, rotX: 0, rotY: s.rotY, rotZ: 0, scaleX: 0.7, scaleY: 0.7, scaleZ: 0.7 },
        ColorDiffuse: { r: 1, g: 1, b: 1 }, Locked: true, Grid: false, Snap: false, Tooltip: true, Counter: { value: 0 } });
    });
  }
}
if (EX && EX.reference){
  const RF = EX.reference;
  base.ObjectStates.push({ GUID: guid(), Name: "BlockSquare", Nickname: "Quick reference", Description: "Round sequence, Tempo and Recovery tables from the rulebook. Text is drawn by the table script.", GMNotes: "MC_REFERENCE",
    Transform: { posX: RF.x, posY: B.surfaceY + 0.14, posZ: RF.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: RF.widthX, scaleY: 0.08, scaleZ: RF.depthZ },
    ColorDiffuse: { r: 0.93, g: 0.90, b: 0.82 }, Locked: true, Grid: false, Snap: false, Tooltip: true });
}

// Opaque playing surface across the whole tabletop (the Kraken top is glass)
if (B.tableTop){
  const T = B.tableTop;
  base.ObjectStates.push({ GUID: guid(), Name: "BlockSquare", Nickname: "Table top", Description: "", GMNotes: "MC_TABLETOP",
    Transform: { posX: T.centerX, posY: B.surfaceY - 0.1 - T.thickness / 2, posZ: T.centerZ, rotX: 0, rotY: 0, rotZ: 0, scaleX: T.widthX, scaleY: T.thickness, scaleZ: T.depthZ },
    ColorDiffuse: T.color, Locked: true, Grid: false, Snap: false, Tooltip: false, IgnoreFoW: true });
}

// Table furniture scale (room for seats and card rows beyond the board)
if (B.tableScale){
  const names = new Set(B.tableScale.names || []);
  for (const o of base.ObjectStates){
    if (names.has((o.Nickname || "").trim())){
      const k = B.tableScale.scale, t = o.Transform;
      t.scaleX *= k; t.scaleY *= k; t.scaleZ *= k;
      // The table mesh's origin is far below its top; keep the top at the board surface after scaling.
      t.posY = B.surfaceY - (B.surfaceY - t.posY) * k;
    }
  }
}

// ---------------------------------------------------------------------------
// Scripts and metadata. The Lua gets the board geometry, card spawn grid and model library from the profile.
// ---------------------------------------------------------------------------
function injectLine(src, name, value){
  const re = new RegExp(`^${name} = \\{.*\\}$`, "m");
  if (!re.test(src)) throw new Error(`Global.lua has no '${name} = { ... }' line to replace.`);
  return src.replace(re, () => value);
}
let lua = injectLine(luaSrc, "BOARD", `BOARD = { centerX = ${B.centerX}, centerZ = ${B.centerZ}, surfaceY = ${B.surfaceY}, widthX = ${F.widthX}, depthZ = ${F.depthZ}, boardWidthX = ${B.widthX}, boardDepthZ = ${B.depthZ} }`);
lua = injectLine(lua, "MODEL_LIBRARY", libraryLua);
const southSeat = seats.find(s => s.z < 0), northSeat = seats.find(s => s.z > 0);
const seatNames = { south: southSeat ? southSeat.color : "South", north: northSeat ? northSeat.color : "North" };
lua = injectLine(lua, "SEATS", `SEATS = { south = "${seatNames.south}", north = "${seatNames.north}" }`);
const xmlOut = xml.replace(/\{SOUTH\}/g, seatNames.south).replace(/\{NORTH\}/g, seatNames.north);
{
  const SP = profile.spawn;
  lua = injectLine(lua, "SPAWN", `SPAWN = { cardStepX = ${SP.cardStepX}, cardRowGap = ${SP.cardRowGap}, cardOffset = ${SP.cardOffset}, modelStepX = ${SP.modelStepX}, modelRowGap = ${SP.modelRowGap}, modelOffset = ${SP.modelOffset}, inset = ${SP.inset} }`);
}

base.SaveName = profile.saveName;
base.GameMode = profile.saveName;
base.LuaScript = lua;
base.LuaScriptState = "";
base.XmlUI = xmlOut;
base.Date = new Date().toLocaleString();
base.Tags = Array.from(new Set([...(base.Tags || []), "Mirrored City"]));
base.Hands = Object.assign(base.Hands || {}, { Enable: seats.length > 0, DisableUnused: false, Hiding: 0 });
if (profile.lighting){
  const { _comment, ...lighting } = profile.lighting;
  base.Lighting = Object.assign({}, base.Lighting || {}, lighting);
}
if ("sky" in profile){ if (profile.sky) base.SkyURL = profile.sky; else delete base.SkyURL; }   // null = TTS default sky
if ("music" in profile && !profile.music && base.MusicPlayer){ base.MusicPlayer.CurrentAudioURL = ""; base.MusicPlayer.CurrentAudioTitle = ""; }
const refTab = { title: "Quick reference", body:
  "ROUND SEQUENCE (rulebook p.12)\n1. Start Phase: generate Tempo, roll for Initiative, draw Harrows, deploy Reinforcements.\n2. Mystic Phase: resolve Arcane and Divine Rites (Spells, Prayers).\n3. Action Phase: players alternate activating models and spending Tempo. Place an Activation token on each model that has activated.\n4. End Phase: Morale, check for victory, Recovery Checks for Stunned models, clean up (remove Activation tokens).\n\nTEMPO per player, from models in play across both warbands:\n16+ = 10   12-15 = 8   8-11 = 6   4-7 = 5   2-3 = 4\n+1 if your LEADER is on the battlefield\n+1 if you are behind in Victory Points\n-2 if your warband is Broken\n+1 per 2 models you are outnumbered by (max +3)\n\nRECOVERY CHECK (2D6 per Stunned model, End Phase)\n2-6 Bleeding Out: 1 Mortal Wound, no Injury Roll\n7-10 On Death's Door: stays Stunned\n11+ Recovered\n\nMEASURING: from the edge of the base closest to the direction of travel. TTS ruler: left toolbar.",
  color: "Grey", visibleColor: { r: 0.5, g: 0.5, b: 0.5 }, id: 1 };
base.TabStates = { "1": refTab, "0": { title: "Mirrored City", body:
  `Mirrored City table (${profile.base.title}).\n\nBattlefield frame: ${F.widthX}" x ${F.depthZ}" (rulebook p.9). Seats: Red south, Blue north.\n\n1. In the list builder press Export for TTS.\n2. Press Import List on the List Importer station, paste, choose Import ${seatNames.south} or Import ${seatNames.north}.\n3. Cards and models land in that player's outlined zone beyond their edge of the board.\n\nMiniatures are embedded in the table script. To swap one in-game, put a model in a bag, set the bag's GM Notes to the unit id (e.g. mc_captain) and press Rescan models.\n\nSources: ${profile.base.title} (table and terrain), Ulthuan (miniatures).`,
  color: "Grey", visibleColor: { r: 0.5, g: 0.5, b: 0.5 }, id: 0 } };

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(base));
const thumb = path.join(workshopDir, profile.base.workshopId + ".png");
if (fs.existsSync(thumb)) fs.copyFileSync(thumb, outPath.replace(/\.json$/i, ".png"));

console.log(report.join("\n"));
console.log(`\nMap: ${profile.base.title}. Dropped ${prunedCount} base objects; kept ${kept.length - shelfBags.length} table/terrain objects and ${shelfBags.length} terrain bags. Dead assets: dropped ${droppedByUrl} objects, stripped ${strippedChildren} attached objects and ${strippedDecals} decals.`);
console.log(G && G.imageUrl ? `Ground tile ${G.widthX}" x ${G.depthZ}" from ${G.imageUrl}` : "No ground tile.");
console.log(`Battlefield frame ${F.widthX}" x ${F.depthZ}" at (${B.centerX}, ${B.centerZ}).`);
console.log(`${unitCount} units in the embedded model library, ${filled} with a model. ${seats.length} seats. Save written to:\n${outPath}\n${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB`);
