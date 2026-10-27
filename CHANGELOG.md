# Changelog

## 2026-10-27 — Mirrored City v1.0.1

- The rules are now versioned **v1.0.1**; the earlier Beta numbers (up to Beta v2.9) count as the alpha. The header, Stat Card export, saved rosters and TTS export all report v1.0.1. Old rosters still load.
- **Sapper** now hands its model the free Blastpowder Bomb: it is added to that card's Equipment at no cost, shown as FREE, and removed if the Duty changes. If all three Equipment slots are full the Summary warns until one is freed. While a Sapper is in the warband, Blastpowder Bombs are Common for everyone.
- **Field Chirurgeon** surgery: the model is Slain if the 3D10 roll is 10 or less (was 25+), all three dice match, or the warband cannot pay.
- **Grappling Iron**: the reroll applies only to Move Checks to climb.
- **Cutthroat** carries a Flash Bomb as part of its fixed wargear; it appears on the card and under Equipment in both exports.

## 2026-10-24 — Card controls

- Dropdowns add on selection: picking a weapon, armor piece, equipment item, Spell/Prayer or Quirk adds it immediately. The Add buttons are gone; Roll D6 / Roll 2D6 remain.
- Each card has a **View / Edit** toggle (stats, tags, Duty, Quirks, Spells and gear with no controls) and a **Collapse / Expand** toggle (card type, custom name and unit only). The Leader card has both as well. The chosen view is saved with the roster.
- Card titles: the bold title is the custom name, otherwise the unit name, otherwise "HERO Card" / "HENCHMEN Card" / "LEADER Card". The card type (Leader, Hero, Henchmen, Sellsword) and the unit name are always shown as pills once a unit is picked.
- Spells and Prayers are their own box in the equipment grid (beside Weapons, Armor and Equipment) instead of a row above the Unit selector. The box header shows the list name and how many entries the model knows.
- Hero and Henchmen cards have ▲ / ▼ arrows to reorder them; the order is saved with the roster. The Leader card stays locked to the top. On narrow screens the card buttons wrap below the title.

## 2026-10-24 — Tabletop Simulator export

- New **Export for TTS** button copies a compact, fully resolved JSON roster to the clipboard (file download as fallback) for the upcoming Tabletop Simulator table. Format documented in the README under "Tabletop Simulator export".
- Weapon and armor collection is shared between the printable Stat Cards and the TTS export (`collectWeaponProfiles`, `collectArmorIds`), so the two never disagree.

## 2026-10-24 — Header

- The page header now leads with the rules version ("Mirrored City Beta v2.9"); "Noble Builder" moves to the subtitle.

## 2026-10-23 — Sellswords (Appendix C)

- Added the five v2.9 Sellswords: Blackhand, Cutthroat, Pit Fighter, Spellwright (Hedgecraft WIZARD) and Strongarm, with stats, retainer fees, fixed wargear and special rules.
- Sellswords are offered to every warband on Henchmen cards, one model per card, with wargear included in the hire cost (no equipment slots).
- Warband creation: no Sellswords unless the warband allows it. Mercenary Companies may hire 1 (Old Contacts); the Summary pill shows the count. A Sellsword does not satisfy the required Henchmen Card.
- Great Feast Hazard Pay adds 25 to the hire cost (retainer +10). The Order of the Last Sun cannot employ WIZARD or PRIEST Sellswords.
- Stat Card export shows the SELLSWORD badge, fixed weapons and armor, and the retainer fee.
- Removed the old "Blade for Hire" placeholder; rosters that referenced it load with that card emptied.

## 2026-10-20 — Mirrored City Beta v2.9

Large rules update. Everything that was based on Beta v1.1 has been replaced with Beta v2.9 values. Old saved rosters still load, but unit costs and equipment will change.

### Rules and data
- All units for the Order of the Last Sun, The Great Feast, The Lorathiir and Mercenary Companies now use v2.9 stats (SPD STR TGH WIL HP ATK FGT SHT ARM XP), tags, costs, limits, innate weapons and special rules.
- Starting budget is 1000 lumens with a 100 unspent cap. A starting warband may have at most 3 Hero Cards; the Leader Card is separate.
- Henchmen cards hold 1–3 models, ELITE 1–2, HORDE 1–4.
- Full v2.9 wargear and Universal Equipment catalog with weapon profiles (RNG/HIT/STR/AP/DMG/Traits) and armor profiles (Armor Value / Injury Save / Mobility / Move Check). Medium Armor and the free-dagger rule are gone.
- Every faction equipment list follows the rulebook, including printed restrictions (JUSTICAR only, DAWNERS only, HALF-BLOOD only, TASKMASTER only, etc.) and list-specific prices (Halberd 20 on Knight's Equipment, Holy Symbol 20 for the Order, Bola 15 for the Lorathiir).
- Rare equipment is hidden at creation unless it appears on the warband's own list or is Common for the unit's tags (Elven Boots/Cloak for ELF heroes).
- Universal equipment restrictions are enforced by tag: HERO only, WIZARD only, PRIEST only, LEADER only, Blackblood Tribe only.
- Half-Blood Brutes and Bladedancers are Hero cards. Pathfinder is now Wayfinder. Purifiers are available to both Order archetypes.

### Slots and costs
- 3 Weapon slots plus 1 Lightweight slot, detected from the Lightweight trait. A second Lightweight weapon uses a normal slot. Bulky weapons (Boom-Boom) take 2 slots.
- Separate limit of 3 pieces of Equipment per Stat Card.
- Hero / Henchmen (X / Y) equipment pricing. Weapons and armor on a Henchmen card are bought per model (p.60); Equipment is priced once per card (p.37). Controlled by `RULES.henchmenWargearPerModel`.
- Duty and Quirk costs are included in card and warband totals.

### Mercenary Duties, Quirks, Spells and Prayers
- Duties use v2.9 costs and are tag-driven (CAPTAIN, LIEUTENANT, VETERAN, DUELIST, SHARPSHOOTER, SPOTTER, MUSCLE). One per model, no duplicates warband-wide, Leader included.
- Complete 2D6 Half-Blood Quirk table with costs. A Half-Blood may take several Quirks and must take at least one. Roll 2D6 or choose.
- Spell and Prayer lists (Blackblood Hexes, Brute Sorcery, Glimmers of the Thornwood, Hedgecraft, Prayers of the Last Sun). The Signature entry is known automatically; the second is generated with a Roll D6 button (6 = choose). Extra entries can be recorded for Spellbooks, Prayer Scrolls and campaign play.

### UI and export
- Custom Name (Leader, Hero, Henchmen) and Roster Name update without re-rendering, so typing keeps focus and caret, including on mobile.
- Cards show stat lines and tag pills (HORDE, ELITE, WIZARD, PRIEST, HALF-BLOOD, LARGE, FEARSOME, BEAST). Duty, Quirk and Spell/Prayer controls appear only where eligible.
- Equipment dropdowns are grouped by rulebook category with Unique / Faction groups.
- Lumen symbol rendered with MIRROREDCITYICONS.TTF (the font file must be deployed next to index.html).
- Stat Card export rebuilt for v2.9: one card per Stat Card with model count, stats, tags, weapons (including innate attacks and equipment profiles), armor, equipment, special rules, Duty, Quirks and known Spells/Prayers.
- Import migrates older rosters (renamed unit ids, single `quirkId`, Brute cards converted to Hero cards) and prunes equipment that no longer exists.

### Not yet supported
- Special materials: Spiritwood, Mithril, Sunsteel, Adamantite, including the Lorathiir two-Spiritwood-weapon allowance.
- Campaign play beyond recording extra Spells/Prayers.

## Earlier
See the git history for the Beta v1.1-era changes (mercenaries, duties, quirks, custom names, card export prototype).
