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
  const t = o.Transform || {};
  o.Transform = { posX: 0, posY: 2, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: t.scaleX ?? 1, scaleY: t.scaleY ?? 1, scaleZ: t.scaleZ ?? 1 };
  return o;
}

const textTemplate = JSON.parse(JSON.stringify(base.ObjectStates.find(o => o.Name === "3DText") || { Name: "3DText", Text: {} }));
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
    Transform: { posX: x, posY: B.surfaceY + 0.03, posZ: z, rotX: 0, rotY: 0, rotZ: 0, scaleX: lenX, scaleY: 0.06, scaleZ: lenZ },
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
// Model shelf: one row per faction
// ---------------------------------------------------------------------------
const MS = profile.shelves.models;
const factionOrder = Object.keys(map.factions);
const report = [];
let bagCount = 0, filled = 0;
factionOrder.forEach((fid, row) => {
  const f = map.factions[fid];
  const z = MS.z0 + row * MS.stepZ;
  base.ObjectStates.push(label3d(f.label, MS.labelX, z, { r: 0.9, g: 0.85, b: 0.7 }));
  const units = Object.entries(map.units).filter(([, u]) => u.faction === fid);
  units.forEach(([unitId, u], col) => {
    let contained = [], status = "empty";
    if (u.tile && u.model){
      const src = (index[u.tile] || {})[u.model];
      if (src){ contained = [cleanModel(src, u.name)]; status = "ok"; filled++; }
      else status = `MISSING: "${u.model}" not found in tile "${u.tile}"`;
    }
    base.ObjectStates.push({
      GUID: guid(), Name: "Bag",
      Transform: { posX: MS.x0 + col * MS.stepX, posY: MS.y, posZ: z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 0.8, scaleY: 0.8, scaleZ: 0.8 },
      Nickname: `${u.name} (${unitId})`,
      Description: `Model library bag for ${u.name}. The importer copies whatever is inside this bag for every ${u.name} model. Drop a different model in to swap it; keep the GM Notes (${unitId}).`,
      GMNotes: unitId, Tags: [LIBRARY_TAG], ColorDiffuse: f.color,
      Locked: true, Grid: false, Snap: false, Tooltip: true,
      Bag: { Order: 0 }, ContainedObjects: contained,
    });
    bagCount++;
    report.push(`${status === "ok" ? "  " : "!!"} ${unitId.padEnd(26)} ${status === "ok" ? u.model : status}${u.note ? "   (" + u.note + ")" : ""}`);
  });
});

// ---------------------------------------------------------------------------
// Scripts and metadata. The Lua gets the board geometry from the profile.
// ---------------------------------------------------------------------------
const boardLua = `BOARD = { centerX = ${B.centerX}, centerZ = ${B.centerZ}, surfaceY = ${B.surfaceY}, widthX = ${F.widthX}, depthZ = ${F.depthZ} }`;
if (!/^BOARD = \{.*\}$/m.test(luaSrc)) throw new Error("Global.lua has no 'BOARD = { ... }' line to replace.");
const lua = luaSrc.replace(/^BOARD = \{.*\}$/m, boardLua);

base.SaveName = profile.saveName;
base.GameMode = profile.saveName;
base.LuaScript = lua;
base.LuaScriptState = "";
base.XmlUI = xml;
base.Date = new Date().toLocaleString();
base.Tags = Array.from(new Set([...(base.Tags || []), "Mirrored City"]));
if (base.Hands) base.Hands.Enable = false;
if (profile.lighting){
  const { _comment, ...lighting } = profile.lighting;
  base.Lighting = Object.assign({}, base.Lighting || {}, lighting);
}
if ("sky" in profile){ if (profile.sky) base.SkyURL = profile.sky; else delete base.SkyURL; }   // null = TTS default sky
if ("music" in profile && !profile.music && base.MusicPlayer){ base.MusicPlayer.CurrentAudioURL = ""; base.MusicPlayer.CurrentAudioTitle = ""; }
base.TabStates = { "0": { title: "Mirrored City", body:
  `Mirrored City table (${profile.base.title}).\n\nBattlefield frame: ${F.widthX}" x ${F.depthZ}" (rulebook p.9).\n\n1. In the list builder press Export for TTS.\n2. Press the Mirrored City button (top right), paste, choose Import South or North.\n3. Model library: shelf south of the table, one bag per unit. Terrain library: shelf north of the table.\n\nSources: ${profile.base.title} (table and terrain), Ulthuan (miniatures).`,
  color: "Grey", visibleColor: { r: 0.5, g: 0.5, b: 0.5 }, id: 0 } };

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(base));
const thumb = path.join(workshopDir, profile.base.workshopId + ".png");
if (fs.existsSync(thumb)) fs.copyFileSync(thumb, outPath.replace(/\.json$/i, ".png"));

console.log(report.join("\n"));
console.log(`\nMap: ${profile.base.title}. Dropped ${prunedCount} base objects; kept ${kept.length - shelfBags.length} table/terrain objects and ${shelfBags.length} terrain bags. Dead assets: dropped ${droppedByUrl} objects, stripped ${strippedChildren} attached objects and ${strippedDecals} decals.`);
console.log(G && G.imageUrl ? `Ground tile ${G.widthX}" x ${G.depthZ}" from ${G.imageUrl}` : "No ground tile.");
console.log(`Battlefield frame ${F.widthX}" x ${F.depthZ}" at (${B.centerX}, ${B.centerZ}).`);
console.log(`${bagCount} bags on the model shelf, ${filled} with a model. Save written to:\n${outPath}\n${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB`);
