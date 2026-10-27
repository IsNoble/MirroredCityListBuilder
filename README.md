# Mirrored City List Builder

A single-file warband builder for **Mirrored City v1.0.1** (the Beta releases up to v2.9 were the alpha; rules data was audited against the Beta v2.9 rulebook plus later designer updates). Everything lives in `index.html`: the page, the styles, the rules data and the logic. There is no build step. Open the file in a browser, or upload `index.html` and `MIRROREDCITYICONS.TTF` to any web host.

- `index.html` — the whole app
- `MIRROREDCITYICONS.TTF` — icon font; the `$` glyph is the lumen symbol (used via `<span class="lumIcon">$</span>`)
- `CHANGELOG.md` — what changed per rules version

Rosters auto-save to the browser's `localStorage` and can be exported/imported as JSON. **Export Stat Cards** opens a printable page.

---

## How the file is laid out

The `<script>` block is ordered data first, logic second. Line numbers drift as the file changes, so search for the `const` names.

| Section | Constant | What it holds |
|---|---|---|
| Rules | `RULES` | Budget, card limits, slot counts, costing flags |
| Units | `UNITS` | Every Leader / Hero / Henchman profile for all factions |
| Unit id aliases | `UNIT_ID_ALIASES` | Old unit ids → current ids, for importing older rosters |
| Equipment catalog | `EQUIPMENT_CATALOG` | Every weapon, armor piece and equipment item, with profiles and costs |
| Equipment lists | `UNIVERSAL_EQUIPMENT_LIST`, `OLS_EQUIP_LISTS`, `GF_EQUIP_LISTS`, `LOR_EQUIP_LISTS`, `MC_EQUIP_LISTS` → merged into `ALL_EQUIP_LISTS` | Which items each warband list offers, with per-list restrictions and prices |
| Spells / Prayers | `SPELL_PRAYER_LISTS` | One entry per list (Blackblood Hexes, Prayers of the Last Sun, …) |
| Half-Blood Quirks | `GREAT_FEAST_HALF_BLOOD_QUIRKS` | The 2D6 Quirk table |
| Mercenary Duties | `MERCENARY_DUTIES` | Duties, costs and the tags that qualify for them |
| Warbands | `WARBANDS` | Factions and their archetypes: which units each archetype may recruit |
| Unit helpers | `unitProfile`, `unitTags`, `maxModelsPerCard` | Read-only helpers over the unit data |

Everything after `let state = {` is logic: availability (`isEquipAllowedForUnit`), costing (`costForCardEquip`, `cardCost`), validation (`validate`), rendering (`render`, `renderStatCard`, `renderEquipmentSlotsUI`), export (`buildOneCardModel`, `buildStatCardHTML`) and save/load (`safeExportState`, `applyImported`).

**Design rule:** the logic is driven by tags and list data. If you find yourself writing `if (unitId === "...")` in a function, the answer is almost always a tag on the unit, a `restrictions` block on the item, or an `overrides` entry on the list instead.

---

## Tags

Tags are plain uppercase strings on units (`tags: [...]`). They come straight from the TAGS line of each unit's rulebook entry and they drive:

- **Equipment eligibility** — item `restrictions.onlyTags` / `notTags`, list `overrides[...].onlyTags` / `notTags`
- **Duty eligibility** — `requiredTags` on a Duty
- **Spell/Prayer eligibility** — a unit gets a list only if it has `spellPrayerList` (give WIZARD/PRIEST units that field)
- **Card size** — `HORDE` (1–4 models per card), `ELITE` (1–2)
- **Display pills** — `HORDE`, `ELITE`, `WIZARD`, `PRIEST`, `HALF-BLOOD`, `LARGE`, `FEARSOME`, `BEAST`
- **Rarity exceptions** — `commonForTags` on an item (e.g. Elven Boots are Common for `ELF`)

Every Leader must carry both `LEADER` and `HERO` (the rules say a Leader is also a HERO, and "HERO only" equipment relies on it). Henchmen carry `HENCHMEN`.

Tags that depend on the chosen archetype go in `tagsByArchetype` (see Half-Bloods below).

---

## Units (`UNITS`)

```js
{ id:"mc_lieutenant", name:"Lieutenant", faction:"mercenary_companies", type:"HERO", cost:135, limit:"0-2",
  tags:["MERCENARY","HERO","LIEUTENANT","HUMAN"],
  stats:{spd:5,str:3,tgh:3,wil:"7+",hp:3,atk:2,fgt:4,sht:"4+",arm:"6+",xp:12},
  equipLists:["mercenary_equipment"],
  specialRules:[ {name:"Steady Command", text:"Friendly models within 6\" add 1 to Will Checks."} ]
}
```

| Field | Notes |
|---|---|
| `id` | Unique. Convention: faction prefix + snake_case (`ols_`, `gf_`, `lor_`, `mc_`). Never reuse an old id for a different unit; add the old id to `UNIT_ID_ALIASES` if you rename. |
| `type` | `LEADER`, `HERO`, `HENCHMAN` (singular; this is the card kind, not the tag) or `SELLSWORD`. |
| `cost` | Recruitment cost per model. For Sellswords the hire price, wargear included. |
| `retainer` | Sellswords only: fee paid after each battle (shown, not costed). |
| `fixedWargear` | Sellswords only: catalog ids of the wargear printed on the profile. Shown read-only on the card and on the export. Combine with `noEquipment:true` and `equipLists:[]`. |
| `limit` | Text from the rulebook heading: `"1"`, `"0-3"` or `""`. The max is enforced across all cards. |
| `limitGroup` | Optional shared cap: `{ id:"mc_veterans", label:"Veterans", max:3 }` on every unit in the group. |
| `stats` | Use numbers for SPD/STR/TGH/HP/ATK/FGT/XP and strings like `"6+"` for WIL/SHT/ARM. Use `"—"` where the profile shows a dash. |
| `equipLists` | List ids the unit may buy from. The Universal Equipment list is added automatically. Use `[]` with `noEquipment:true` for units that cannot take wargear. |
| `equipListsByArchetype` | Instead of `equipLists`, when the list depends on the archetype: `{ glutton_host:[...], blackblood_tribe:[...] }`. |
| `tagsByArchetype` | Extra tags gained per archetype, e.g. Half-Bloods gain `OGRE` or `TROLL`. |
| `spellPrayerList` | Key into `SPELL_PRAYER_LISTS`. Only WIZARD/PRIEST units should have it. |
| `noArmor`, `noHelmet`, `noShield` | Hard slot bans from the unit's Wargear text. `armorOnly:["eq_felmorn_weave"]` limits body armor to specific items. |
| `quirks:true` | Unit must buy Half-Blood Quirks (combined with the `HALF-BLOOD` tag). |
| `weaponProfiles` | Innate attacks (Long Claws, Slavering Jaws). Same shape as a weapon profile plus `name` and `type`. Shown on the export. |
| `specialRules` | `{name, text}` pairs, shown on the export. |

**Adding a unit**

1. Add the object to `UNITS` under the faction's comment banner.
2. Add its `id` to `leaders`, `heroes` or `henchmen` of every archetype in `WARBANDS` that may recruit it. A unit not listed in an archetype is never offered.
3. If it is a new kind of specialist, give it a distinctive tag so lists and Duties can reference it (e.g. `"VIGILANT"`).

**Sellswords** (Appendix C) are `type:"SELLSWORD"` units with `faction:""`. They are not listed in any archetype: every warband is offered all of them on Henchmen cards, one model per card, unless the warband's `sellswordBan` excludes them. To add one, add the unit with `fixedWargear`, `retainer`, `noEquipment:true` and (for casters) `spellPrayerList`.

---

## Equipment catalog (`EQUIPMENT_CATALOG`)

Keyed by id. Two small factories keep profiles short:

```js
mkWeapon(range, hit, str, ap, dmg, traits)         // -> { type:"weapon", ... }
mkArmor(armorValue, injurySave, moveCheck, mobility, traits)  // -> { type:"armor", ... }
```

Examples of each category:

```js
// Melee weapon (p.33)
eq_rapier: { id:"eq_rapier", name:"Rapier", category:"MELEE", tags:["WEAPON","MELEE"], cost:15, rarity:"Common",
  stats: mkWeapon('1"', "User", "User -1", "—", "1", ["Crit (Extra Attack)","Defend +1","Riposte"]) },

// Body armor (p.36)
eq_heavy_armor: { id:"eq_heavy_armor", name:"Heavy Armor", category:"ARMOR", tags:["ARMOR","BODY"], cost:70, rarity:"Common",
  stats: mkArmor("-2", "5+", "1", "1", ["Injury -1"]) },

// Universal equipment with Hero / Henchmen pricing and a restriction (p.37)
eq_healers_kit: { id:"eq_healers_kit", name:"Healer's Kit", category:"GEAR", tags:["UNIVERSAL"],
  costHero:25, costHenchmen:40, rarity:"Common", rules:"When the bearer performs a Mend action, roll two dice and keep one." },
eq_arcane_focus: { ..., cost:35, rarity:"Common", restrictions:{ onlyTags:["WIZARD"] }, rules:"..." },

// Faction-unique weapon
eq_solar_mace: { id:"eq_solar_mace", name:"Solar Mace", category:"MELEE", tags:["WEAPON","MELEE","UNIQUE"], cost:30, rarity:"Common",
  uniqueToFaction:"order_of_the_last_sun", stats: mkWeapon(...) },
```

| Field | Notes |
|---|---|
| `category` | Which dropdown group it lands in: `MELEE`, `RANGED`, `BLASTPOWDER`, `HELMET`, `ARMOR`, `SHIELD`, or for equipment `GEAR`, `IMPLEMENT`, `ENHANCEMENT`, `POTION`, `COMPANION` (labels in `OTHER_GROUP_LABELS`). |
| `tags` | Decide the **slot**: `HELMET`, `SHIELD`, `ARMOR` (+`BODY`), or `WEAPON`/`MELEE`/`RANGED`/`BLASTPOWDER`. Anything else is general Equipment. Add `UNIVERSAL` for items on the Universal list, `UNIQUE` for faction items, `CONSUMABLE`, `TWO_HANDED`, `THROWN` as printed. |
| `cost` | A number, or a variable string such as `"20+D10"` (the base is counted, the roll is flagged as variable). |
| `costHero` / `costHenchmen` | X / Y pricing. Hero and Leader cards pay `costHero`; Henchmen cards pay `costHenchmen`. Leave `cost` out when both are present. |
| `rarity` | `"Common"` or a number (`Rare 8` → `8`). Rare items are hidden at warband creation unless the item is on one of the unit's warband lists or is Common for one of its tags. |
| `commonForTags` | Tags for which a Rare item counts as Common. |
| `restrictions` | `{ onlyTags, notTags, onlyArchetypes }` printed on the item itself (HERO only, LEADER only, Blackblood Tribe only). |
| `uniqueToFaction` | Warband id. The item is invisible to other factions even if it ends up on a shared list. |
| `allowDuplicates`, `maxPerCard` | For equipment a card may carry more than once (Manacles: up to two). |
| `weaponProfiles` | Attack profiles printed on an equipment item (Torch, Bola, Hook Hand). They show in the Weapons table on export but do not use weapon slots. |
| `rules` | Free text shown on chips (tooltip) and on the export. |

**Weapon slot behaviour comes from traits, not from fields.** A weapon whose traits include `Lightweight` may use the Lightweight slot; `Bulky` (or `Bulky 2`) makes it occupy extra Weapon slots. Keep trait spelling as printed.

**Adding an item**

1. Add it to `EQUIPMENT_CATALOG` in the matching block.
2. If it is universal, give it the `UNIVERSAL` tag; it is picked up by `UNIVERSAL_EQUIPMENT_LIST` automatically and every unit can see it (subject to `restrictions` and rarity).
3. Otherwise add its id to the `items` of each warband list that offers it (next section).
4. A "counts as" item (Cleaver counts as Axe, Rocks count as Throwing Knives, Sun Mask counts as Helmet) is its own catalog entry with the base item's profile copied and `UNIQUE` + `uniqueToFaction` set.

---

## Equipment lists (`*_EQUIP_LISTS`)

One object per printed list. Lists are slot-agnostic: a unit draws from all of its lists for every slot, and the item's own tags decide which slot it fills.

```js
soldiers_equipment: {
  id: "soldiers_equipment", name: "Soldier's Equipment", faction: "order_of_the_last_sun",
  items: [ "eq_axe","eq_club","eq_dagger","eq_halberd", ..., "eq_blunderbuss","eq_long_rifle","eq_musket", "eq_helmet", ... ],
  overrides: {
    eq_halberd:     { onlyTags: ["MAN-AT-ARMS"] },     // "(MAN-AT-ARMS only)"
    eq_blunderbuss: { onlyTags: ["VIGILANT"] },        // "BLASTPOWDER WEAPONS (VIGILANTS ONLY)"
    eq_pyreshot:    { cost: 25 }                       // list prints its own price
  }
}
```

| Override key | Meaning |
|---|---|
| `onlyTags` / `notTags` | Restriction printed next to the item on that list. |
| `onlyArchetypes` | Item only on that list for the given archetype ids. |
| `cost` | Price printed on the list when it differs from the catalog (Halberd 20 on Knight's Equipment). Also lets a Rare universal item be bought at creation at the listed price (Holy Symbol 20 for the Order). |

The `faction` field is informational. Access is granted by the unit's `equipLists`, so a list can be shared by several units or even several factions.

**Adding a list**

1. Add the object to the faction's `*_EQUIP_LISTS` (or create a new `XX_EQUIP_LISTS` constant and spread it into `ALL_EQUIP_LISTS`).
2. Reference its id from the units that use it.
3. The id `universal_equipment` is reserved.

---

## Spells and Prayers (`SPELL_PRAYER_LISTS`)

```js
brute_sorcery: {
  id:"brute_sorcery", name:"Brute Sorcery", type:"SPELL", label:"Spells",
  entries: [
    { id:"bs_split_the_earth", name:"Split the Earth", signature:true, powerCost:7, empoweredPowerCost:10,
      tags:["SIGNATURE SPELL","STRIKE"], effect:"Target: ... Effect: ... Empowered (10): ..." },
    { id:"bs_lightning_blast", name:"Lightning Blast", roll:1, powerCost:10, empoweredPowerCost:12, tags:[...], effect:"..." },
    ... rolls 2–5 ...
  ]
}
```

- `type` is `SPELL` or `PRAYER`; `label` is the plural shown in the UI.
- Exactly one entry has `signature:true`. The other five carry `roll` 1–5 (6 is "choose" per the rules).
- `powerCost` may be `"*"` for entries resolved outside the Mystic Phase; `empoweredPowerCost` may be `null`.
- `note` holds cost modifiers such as "+2 Power Cost if targeting an enemy model".

Attach a list to a unit with `spellPrayerList:"brute_sorcery"`. Known entries are stored per card as `magicIds` (the Signature is never stored; it is implied).

---

## Half-Blood Quirks (`GREAT_FEAST_HALF_BLOOD_QUIRKS`)

```js
{ id:"thick_hide", roll:5, name:"Thick Hide", cost:30, rules:"... The model subtracts 1 from its Armor." }
```

One entry per 2D6 result (2–12). Costs are added to the card. Quirks are offered to any unit whose tags include `HALF-BLOOD` and that has `quirks:true`; such units must take at least one.

---

## Mercenary Duties (`MERCENARY_DUTIES`)

```js
{ id:"quartermaster", name:"Quartermaster", cost:50, requiredTags:["CAPTAIN","LIEUTENANT"], rules:"..." }
```

A unit may take a Duty if it has the `MERCENARY` tag and at least one of `requiredTags`. The builder enforces one Duty per model and no duplicates across the warband (Leader included). To make a new unit eligible, give it the matching tag; do not add unit ids here.

---

## Warbands and archetypes (`WARBANDS`)

```js
{
  id: "the_great_feast", name: "The Great Feast", factionTag: "GREAT FEAST", description: "...",
  sellswordCostModifier: 25,          // Hazard Pay: Sellswords cost +25
  sellswordRetainerModifier: 10,      // ...and their retainer is +10
  archetypes: [
    { id: "glutton_host", name: "Glutton Host", description: "...",
      leaders: ["gf_colossal","gf_ogre_bully"],
      heroes: ["gf_half_blood_brute", ...],
      henchmen: ["gf_ogre_youngun","gf_scraplings","gf_thralls"] }
  ]
}
```

Archetypes are the only place that decides which units a player can pick (Sellswords excepted, see below). A warband without printed archetypes still needs one archetype object (see Mercenary Companies). Archetype ids are also what `equipListsByArchetype`, `tagsByArchetype` and `onlyArchetypes` refer to.

Warband-level Sellsword fields, all optional:

| Field | Meaning |
|---|---|
| `sellswordsAtCreation` | How many Sellswords may be hired during warband creation (default 0; Mercenary Companies 1 for Old Contacts). |
| `sellswordCostModifier` / `sellswordRetainerModifier` | Added to every Sellsword's hire cost / retainer (Great Feast Hazard Pay). |
| `sellswordBan` | `{ tags:["WIZARD","PRIEST"], unlessTag:"SOLMIRIC" }` hides Sellswords with those tags (Order of the Last Sun). |

**Adding a faction**

1. Units in `UNITS` with a new id prefix and a faction tag.
2. Unique items in `EQUIPMENT_CATALOG` with `uniqueToFaction` set to the new warband id.
3. A new `XX_EQUIP_LISTS` constant, spread into `ALL_EQUIP_LISTS`.
4. Spell/Prayer lists if the faction has casters.
5. A `WARBANDS` entry with at least one archetype.
6. Faction-wide special rules that need validation (like Who's Cooking?) go in `validate()`, keyed on `state.warbandId`.

---

## Rules knobs (`RULES`)

| Key | Default | Meaning |
|---|---|---|
| `startingLumens` | 1000 | Starting budget |
| `startingMaxUnspent` | 100 | Warning threshold for unspent lumens |
| `startingStatCardsMax` / `startingStatCardsMinFilled` | 5 / 3 | Card limits, Leader included |
| `startingMaxHeroCards` | 3 | Hero Cards, Leader Card not included |
| `sellswordsAllowedAtCreation` | `false` | Set `true` to lift the creation ban for every warband (campaign / exhibition play). Per-warband allowances live on the warband (`sellswordsAtCreation`). |
| `henchmenWargearPerModel` | `true` | Weapons/armor on a Henchmen card cost × model count (p.60). Equipment is always priced once per card (p.37). |
| `equipSlots` | 3 / 1 / 1 / 1 / 1 / 3 | WEAPON, LIGHTWEIGHT, HELMET, ARMOR, SHIELD, OTHER (general Equipment) |
| `henchmenPerCard` | 3 / 2 / 4 | DEFAULT, ELITE, HORDE |

---

## Saved roster format

`safeExportState()` produces the JSON used for both `localStorage` and the Export button:

```json
{ "version": 7, "rules": "v1.0.1",
  "roster": { "name", "warbandId", "archetypeId", "leaderUnitId", "leaderEquipment", "leaderCustomName", "leaderDutyId", "leaderMagicIds",
    "cards": [ { "id", "kind", "unitId", "count", "customName", "dutyId", "quirkIds", "magicIds",
                 "equipment": { "weaponIds": [], "helmetId": "", "armorId": "", "shieldId": "", "otherIds": [] } } ] } }
```

If you rename a unit id, add `old_id: "new_id"` to `UNIT_ID_ALIASES`; `applyImported()` migrates it. Items that no longer exist or are no longer legal are pruned on import.

---

## Tabletop Simulator export

**Export for TTS** copies a compact JSON roster to the clipboard (or downloads `<name>_tts.json` when the clipboard is unavailable). It is meant to be pasted into the Import panel of the Mirrored City Tabletop Simulator table, which parses it with `JSON.decode` and spawns one object per Stat Card. Unlike the saved roster, it is fully resolved: names, stats and rules text are included so the mod needs no copy of the data tables.

`buildTTSExport()` → `buildTTSCardData(cardLike)` build it; `collectWeaponProfiles` and `collectArmorIds` are shared with the printable Stat Cards so both exports always agree.

```json
{ "format": "mirrored-city-tts", "formatVersion": 1, "rules": "v1.0.1", "exportedAt": "<ISO date>",
  "roster": { "name", "warbandId", "warband", "archetypeId", "archetype", "spent", "spentVariable" },
  "cards": [ {
    "kind": "LEADER | HERO | HENCHMEN | SELLSWORD",
    "unitId", "unit", "name", "count", "cost", "costVariable",
    "tags": ["HERO", "..."],
    "stats": { "spd", "str", "tgh", "wil", "hp", "atk", "fgt", "sht", "arm", "xp" },
    "weapons":   [ { "name", "range", "hit", "str", "ap", "dmg", "traits": [] } ],
    "armor":     [ { "name", "slot", "armorValue", "injurySave", "mobility", "moveCheck", "traits": [], "rules" } ],
    "equipment": [ { "name", "rules" } ],
    "weaponRules": [ { "name", "text" } ],
    "special":   [ { "name", "text" } ],
    "sellsword": { "retainer", "fixedWargear": [] } | null,
    "duty":      { "name", "cost", "rules" } | null,
    "quirks":    [ { "name", "cost", "rules" } ],
    "magic":     { "label", "list", "entries": [ { "name", "signature", "powerCost", "empoweredPowerCost", "tags": [], "note", "effect" } ] } | null
  } ] }
```

Notes for the mod side:

- `name` is the custom name if one was set, otherwise the unit name. `unit` is always the unit name.
- `count` is the number of models on a Henchmen card; everything else is 1. `cost` is the whole card.
- `weapons` is in print order: innate attacks (suffixed `(innate)`), Sellsword fixed wargear, equipped weapons, then attack profiles printed on equipment. Missing values are `"—"`.
- `magic.entries` always starts with the Signature spell/prayer when the list has one.
- Bump `TTS_FORMAT_VERSION` in `index.html` whenever a field changes shape; the mod should refuse newer versions it does not understand.

The table itself lives in [`tts/`](tts/README.md): a build script that assembles the save from two cached Workshop mods, the Lua and XML for the import panel, and the unit-to-miniature mapping.

---

## Checking a change

There is no test runner in the repo. The quickest checks after editing data:

1. Open `index.html`, pick each warband and archetype, and confirm every unit appears in the Leader / Hero / Henchmen dropdowns.
2. Select a unit and confirm its equipment dropdowns show the printed list and nothing else.
3. Watch the Summary panel: red messages are rule violations, yellow are warnings.
4. Press **Export Stat Cards** and sanity-check one card per faction.

In the browser console, `allowedEquipmentForUnitSlot("ols_purifier", "WEAPON").map(e => e.name)` and `validate()` are handy for spot checks.
