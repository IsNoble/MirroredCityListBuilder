# Mirrored City — Tabletop Simulator table

A Tabletop Simulator (TTS) save that imports warbands exported from the list builder and spawns their Stat Cards and miniatures on the table. It is a data-driven companion to the builder, not a rules engine: the builder stays the single source of truth for units, equipment and costs.

| File | What it is |
|---|---|
| `build-save.js` | Builds the save. Reads the two cached Workshop mods, copies the models into library bags, injects the scripts, writes to the TTS Saves folder. |
| `model-map.json` | Which Ulthuan model represents each builder unit id, plus the Workshop ids of the source mods. Edit this to change a miniature. |
| `Global.lua` | Table script: import panel handlers, roster parsing, card and model spawning, clearing. |
| `Global.xml` | Screen-space UI for the import panel. |
| `CREDITS.md` | Source mods. Paste into the Workshop description if the table is ever published. |

## Building the save

Prerequisites: subscribe to the two source mods (ids in `model-map.json`) and open each once in TTS so they are cached under `Documents\My Games\Tabletop Simulator\Mods\Workshop\`.

There is no Node on this machine, so VS Code's Electron is used as Node:

```
ELECTRON_RUN_AS_NODE=1 "C:/Users/<you>/AppData/Local/Programs/Microsoft VS Code/Code.exe" tts/build-save.js
```

Output: `Documents\My Games\Tabletop Simulator\Saves\Mirrored City - Merchant Quarter.json` plus a thumbnail. Load it from Games, Save & Load. The script prints one line per unit; `!!` marks a bag that stayed empty because the model name was not found.

Rerun after any change to `model-map.json`, `Global.lua` or `Global.xml`. The shelf is rebuilt each time; everything else in the base map is untouched. Pass `--out <path>` to write somewhere else.

## Using the table

1. In the list builder press **Export for TTS**. The roster JSON is now on the clipboard.
2. In TTS press the **Mirrored City** button (top right), paste into the box, press **Import South** or **Import North**.
3. One Notecard per Stat Card appears outside the table edge on that side, with the full card text on it and a **Full** button that opens a readable panel. One miniature per model appears just inside the edge, named after its card, with the stat line and weapons as hover text.
4. **Clear South / North / All** removes what the importer spawned and nothing else. Importing to a side clears it first.

Positions are in `CONFIG.sides` at the top of `Global.lua`.

## The model library

A shelf of locked bags sits south of the table (below the rulebook PDFs), one row per faction and one bag per unit id. The bag's GM Notes hold the unit id and the importer copies whatever is inside for every model of that unit, so:

- **To swap a miniature in-game:** drop a different model into the bag, delete the old one, save. No script change.
- **To swap it permanently:** change `model` (and `tile`) in `model-map.json` and rebuild. The model name must match the hover name in the Ulthuan mod exactly.
- **Empty bag:** the importer spawns a pawn tinted in the warband's colour. The five Sellswords are empty on purpose until a model is chosen.

Press **Rescan model library** in the panel after editing bags in-game.

## Script workflow

The Tabletop Simulator Lua extension for VS Code can push `Global.lua` and `Global.xml` straight into a running game for quick iteration. Once a change works, rebuild the save so the file on disk matches.

## Format contract

The importer accepts `format: "mirrored-city-tts"` up to `formatVersion` 1 (see `CONFIG.maxFormatVersion`). When the builder bumps `TTS_FORMAT_VERSION`, update the Lua to handle the new fields and raise the max.
