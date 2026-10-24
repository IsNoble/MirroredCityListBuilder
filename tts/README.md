# Mirrored City — Tabletop Simulator table

A Tabletop Simulator (TTS) save that imports warbands exported from the list builder and spawns their Stat Cards and miniatures on the table. It is a data-driven companion to the builder, not a rules engine: the builder stays the single source of truth for units, equipment and costs.

| File | What it is |
|---|---|
| `build-save.js` | Builds the save. Reads the base map and the Ulthuan mod from the Workshop cache, keeps only the terrain, adds the battlefield frame, model shelf and scripts, writes to the TTS Saves folder. |
| `maps/<name>.json` | One profile per base map: Workshop id, which objects to keep, where the board sits, battlefield size, shelf positions. `--map <name>` picks it; default `merchant-quarter`. |
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

Output: `Documents\My Games\Tabletop Simulator\Saves\MirroredCity\Mirrored City - Merchant Quarter.json` plus a thumbnail. Load it from Games, Save & Load. The script prints one line per unit; `!!` marks a bag that stayed empty because the model name was not found.

Rerun after any change to `model-map.json`, `Global.lua` or `Global.xml`. Pass `--out <path>` to write somewhere else.

What survives from the base map is decided by the profile's `keep` block: the table surface, every terrain piece inside `playBox`, the listed GUIDs (the two dice dispensers), and the listed bags (terrain and effects, re-labelled and parked on a shelf north of the table). Everything else is dropped: rulebooks, warband sheets, scenarios, counters, templates, hand zones, deployment markers, setup instructions, cabinets. To keep something else, add its GUID to `keep.guids` or `keep.bags`.

## Dead assets

Old Workshop maps point at files that no longer exist (pastebin meshes, dead CDN bundles, a sky image). TTS shows a load error and a blank model for each. The profile's `keep.stripUrlPatterns` lists URL fragments that are known dead: any object whose own asset matches is dropped, and attached objects or decals that match are removed from their parent. `keep.dropGuids` drops specific objects by id. `sky: null` resets to the default sky and `music: null` clears the music player.

To find new dead links after swapping maps, run the scratch URL checker against the built save (GET, with `cloud-3.steamusercontent.com` rewritten to `steamusercontent-a.akamaihd.net`, which is the host TTS really uses; a plain HEAD on the old host returns 403 for everything).

## Ground texture

The profile's `ground` block lays a textured Custom_Tile over the board under the terrain. `assets/ground-cobblestone.jpg` is a 72" x 48" tiling of a CC0 cobblestone texture by n4 from OpenGameArt, built with the scratch tiling script in headless Edge. It is referenced as a `file://` URL, so it works only on this machine; before publishing, upload it to Steam Cloud in-game and put the resulting URL in `ground.imageUrl`.

## Battlefield size

The rulebook (p.9) plays on a 44" by 30" battlefield, or 22" by 30" for small scenarios. Most Workshop tables are 72" by 48", so the build draws a gold frame of the rulebook size in the middle of the board and leaves the terrain outside it as scenery. Cards spawn just outside the frame, models just inside. The frame size and centre come from the profile's `board` and `battlefield` blocks and are injected into `Global.lua` as the `BOARD` line.

## Adding another map

1. Subscribe to the map on the Workshop and open it once so it is cached.
2. Copy `maps/merchant-quarter.json` to `maps/<name>.json`, set `base.workshopId`, `saveName`, and the `board` centre.
3. List what to keep. The scratch script approach that worked for Merchant Quarter: dump every object with its name, position and bag contents, then fill `keep.tableNames`, `keep.playBox`, `keep.guids` and `keep.bags`.
4. Build with `--map <name>`. The model shelf, importer and frame are the same on every map.

## Using the table

The table has two seats, Red on the south edge and Blue on the north, each with a **Sit here** button on its coloured bar, and the List Importer station in the free strip left of the board. Each player has an outlined staging zone in their colour beyond their edge of the board: an imported warband's cards fill the rows nearest the board and its models the rows behind, and the player deploys from there. Distances are measured with TTS's own ruler on the left toolbar. The Kraken table is scaled up by half so all of this fits around the 72" x 48" board; its top is glass, so the build lays a black slab across it as the playing surface (`board.tableTop` in the profile).

1. In the list builder press **Export for TTS**. The roster JSON is now on the clipboard.
2. Press **Import Warband** on the List Importer station (or the **Mirrored City** button, top right), paste into the box, press **Import Red** or **Import Blue**.
3. One Notecard per Stat Card appears in that player's zone with the full card text on it. One miniature per model appears in the rows behind the cards, named after its card, with the stat line and weapons as hover text.
4. **Clear Red / Blue** on the station (or **Clear All** in the panel) removes what the importer spawned and nothing else. Importing to a zone clears it first.

The side names come from the profile's seat colours; the build injects them into the Lua (`SEATS`) and the XML.

Positions come from `BOARD` and `SPAWN`, which the build injects from the profile's `board`, `battlefield` and `spawn` blocks.

## The model library

The miniatures are embedded in the table script as `MODEL_LIBRARY`, one object JSON per unit id, so nothing sits on the table. The importer spawns from it with `spawnObjectData`.

- **To swap a miniature permanently:** change `model` (and `tile`) in `model-map.json` and rebuild. The model name must match the hover name in the Ulthuan mod exactly.
- **To swap one in-game without rebuilding:** put a model in any bag, set the bag's GM Notes to the unit id (for example `mc_captain`) and press **Rescan models**. A bag with a unit id in its notes overrides the embedded model.
- **No model:** the importer spawns a pawn tinted in the warband's colour. The five Sellswords have none on purpose until a model is chosen.

## Script workflow

The Tabletop Simulator Lua extension for VS Code can push `Global.lua` and `Global.xml` straight into a running game for quick iteration. Once a change works, rebuild the save so the file on disk matches.

## Format contract

The importer accepts `format: "mirrored-city-tts"` up to `formatVersion` 1 (see `CONFIG.maxFormatVersion`). When the builder bumps `TTS_FORMAT_VERSION`, update the Lua to handle the new fields and raise the max.
