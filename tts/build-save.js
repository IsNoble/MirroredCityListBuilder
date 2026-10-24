/*
  Builds the Mirrored City Tabletop Simulator save.

  Base table  : the cached "Merchant Quarter" Workshop save (model-map.json → sources.merchant)
  Models      : copied out of the cached "Ulthuan" Workshop save's faction tiles (sources.ulthuan)
  Scripts     : Global.lua / Global.xml next to this file
  Output      : <TTS Saves dir>/Mirrored City - Merchant Quarter.json (+ .png thumbnail)

  Run (no node on this machine; VS Code's Electron works as Node):
    ELECTRON_RUN_AS_NODE=1 "C:/Users/<you>/AppData/Local/Programs/Microsoft VS Code/Code.exe" tts/build-save.js [--out <path.json>]

  Re-run whenever model-map.json, Global.lua or Global.xml change. The shelf is rebuilt from scratch
  each time; anything else in the base save is left exactly as it was.
*/
const fs = require("fs");
const path = require("path");
const os = require("os");

const here = __dirname;
const map = JSON.parse(fs.readFileSync(path.join(here, "model-map.json"), "utf8"));
const lua = fs.readFileSync(path.join(here, "Global.lua"), "utf8");
const xml = fs.readFileSync(path.join(here, "Global.xml"), "utf8");

const ttsDir = path.join(os.homedir(), "Documents", "My Games", "Tabletop Simulator");
const workshopDir = path.join(ttsDir, "Mods", "Workshop");
const savesDir = path.join(ttsDir, "Saves");
const SAVE_NAME = "Mirrored City - Merchant Quarter";
let outPath = path.join(savesDir, SAVE_NAME + ".json");
const argv = process.argv.slice(2);
const oi = argv.indexOf("--out"); if (oi >= 0) outPath = argv[oi + 1];

const LIBRARY_TAG = "MC_LIBRARY";

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------
function loadWorkshop(id, title){
  const p = path.join(workshopDir, id + ".json");
  if (!fs.existsSync(p)) throw new Error(`${title} (Workshop ${id}) is not cached at ${p}. Subscribe and open it in TTS once.`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const base = loadWorkshop(map.sources.merchant.workshopId, map.sources.merchant.title);
const ulthuan = loadWorkshop(map.sources.ulthuan.workshopId, map.sources.ulthuan.title);

// ---------------------------------------------------------------------------
// Index the Ulthuan models: tile nickname -> model nickname -> object JSON (top-level objects preferred)
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

// Strip everything from a copied model that belongs to its old home.
function cleanModel(src, label){
  const o = JSON.parse(JSON.stringify(src));
  delete o.LuaScript; delete o.LuaScriptState; delete o.XmlUI; delete o.States; delete o.AttachedSnapPoints;
  delete o.ContainedObjects; delete o.GMNotes; delete o.Tags; delete o.AttachedDecals;
  o.GUID = guid();
  o.Nickname = label;
  o.Description = "";
  o.Locked = false;
  const t = o.Transform || {};
  o.Transform = { posX: 0, posY: 2, posZ: 0, rotX: 0, rotY: 0, rotZ: 0,
                  scaleX: t.scaleX ?? 1, scaleY: t.scaleY ?? 1, scaleZ: t.scaleZ ?? 1 };
  return o;
}

// ---------------------------------------------------------------------------
// Shelf layout: one row per faction, south of the table, below the rulebook PDFs.
// ---------------------------------------------------------------------------
const SHELF = { x0: -62, stepX: 3.6, z0: -48, stepZ: -4.2, y: 1.5, labelX: -70 };
const factionOrder = Object.keys(map.factions);

// Remove any shelf from a previous build so the script is rerunnable on its own output too.
base.ObjectStates = base.ObjectStates.filter(o => !((o.Tags || []).includes(LIBRARY_TAG) || (o.GMNotes || "").startsWith("MC_SHELF")));

const textTemplate = base.ObjectStates.find(o => o.Name === "3DText");
function label3d(text, x, z, color){
  const o = textTemplate ? JSON.parse(JSON.stringify(textTemplate)) : { Name: "3DText", Text: {} };
  o.GUID = guid(); o.Nickname = ""; o.Description = ""; o.GMNotes = "MC_SHELF_LABEL"; o.Locked = true;
  delete o.LuaScript; delete o.LuaScriptState; delete o.XmlUI;
  o.Transform = { posX: x, posY: SHELF.y + 0.1, posZ: z, rotX: 90, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
  o.Text = { Text: text, colorstate: color, fontSize: 48 };
  return o;
}

const report = [];
let bagCount = 0, filled = 0;
factionOrder.forEach((fid, row) => {
  const f = map.factions[fid];
  const z = SHELF.z0 + row * SHELF.stepZ;
  base.ObjectStates.push(label3d(f.label, SHELF.labelX, z, { r: 0.9, g: 0.85, b: 0.7 }));
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
      Transform: { posX: SHELF.x0 + col * SHELF.stepX, posY: SHELF.y, posZ: z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 0.8, scaleY: 0.8, scaleZ: 0.8 },
      Nickname: `${u.name} (${unitId})`,
      Description: `Model library bag for ${u.name}. The importer copies whatever is inside this bag for every ${u.name} model. Drop a different model in to swap it; keep the GM Notes (${unitId}).`,
      GMNotes: unitId,
      Tags: [LIBRARY_TAG],
      ColorDiffuse: f.color,
      Locked: true, Grid: false, Snap: false, Tooltip: true,
      Bag: { Order: 0 },
      ContainedObjects: contained,
    });
    bagCount++;
    report.push(`${status === "ok" ? "  " : "!!"} ${unitId.padEnd(26)} ${status === "ok" ? u.model : status}${u.note ? "   (" + u.note + ")" : ""}`);
  });
});

// ---------------------------------------------------------------------------
// Scripts and metadata
// ---------------------------------------------------------------------------
base.SaveName = SAVE_NAME;
base.GameMode = SAVE_NAME;
base.LuaScript = lua;
base.LuaScriptState = "";
base.XmlUI = xml;
base.Date = new Date().toLocaleString();
base.Tags = Array.from(new Set([...(base.Tags || []), "Mirrored City"]));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(base));
const thumb = path.join(workshopDir, map.sources.merchant.workshopId + ".png");
if (fs.existsSync(thumb)) fs.copyFileSync(thumb, outPath.replace(/\.json$/i, ".png"));

console.log(report.join("\n"));
console.log(`\n${bagCount} bags on the shelf, ${filled} with a model. Save written to:\n${outPath}\n${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB`);
