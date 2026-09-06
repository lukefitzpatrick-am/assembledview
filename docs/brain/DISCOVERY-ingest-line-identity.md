# ON-5 — Can two ingests of the same publisher schedule be matched line-for-line?

Read-only. Fixtures: QMS Paid 41-line (`qms_strength-meals_esb-ooh.xlsx`), JCDecaux 106-line (`jcd_strength-meals_ooh.xlsx`), SCA 23-line (`sca_boss-engineering_fy26_v1.xlsx`). SCA v2-rev (`sca_boss-engineering_fy26_v2-rev.xlsx`, 45 proposed rows) is a real publisher revision of the same campaign, used only as an amendment pair.

No production code was changed. Numbers below were produced by running the existing ingest pipeline (`buildIngestReviewFromFile` / `proposeLineItemsFromSheet` / `stampProposalForSave`) against those files.

## Verdict

**Automatic apply is not safe for any of the three publishers.** Re-accepting an amended file today would mint a new 1…n `line_item_id` sequence and append duplicate plan lines.

Two different identities are in play:

1. **Publisher-file identity** — a column (or composite) in the xlsx that names the buy.
2. **Our persist identity** — `{mba}{OH|RA}{n}` minted on accept from **proposal array order**, plus `source_row_ref = "{sheet}!r{excelRow}"`. Both are positional. Reorder-only of the same content restamps almost every `line_item_id` (QMS 40/41 drifted, JCD 106/106, SCA 44/45).

A future amendment matcher must join the **new file’s publisher-side key** to **already-persisted `line_item_panels.site_number` / radio attrs**, not to `line_item_id` or `source_row_ref`.

| Publisher | Stable publisher-side key in this fixture? | Auto-apply | Human gate |
|---|---|---|---|
| **QMS** | Yes — `SITE NUMBER / NO. OF PANELS` → `site_number`. 41/41 unique on the accepted Paid sheet (`QMN-D345` inventory codes). | **No.** Matching can be proposed. Silent UPDATE is not safe (one fixture, pack-header ambiguity, Bonus sheet unused). | File-level confirm of the diff is enough for unique hits. Unmatched rows stay human. |
| **JCDecaux** | **Partial.** `Panel #` → `site_number` is unique on **95/106** real buy rows (`03699.01.01` face ids). **11/106 have no usable Panel #** (6 blank leftovers + 5 `JCDecaux CAMPAIGN SUMMARY` rows that still have grid occupancy). | **No.** The file as a whole cannot be auto-amended. | The 95 unique Panel # rows can be *suggested*. The 11 must be human line-by-line. Do not invent a fallback heuristic for the 11. |
| **SCA** | **No publisher booking ref.** Station is a grouping-row stack, not a column. Composite `station + daypart + media_description + length` is unique *inside* each snapshot, and **breaks on the real v1→v2 revision** (12/23 matched; daypart labels moved `BTA` → `ROS`; row count 23 → 45). | **This publisher cannot be auto-amended.** | Always human-confirmed line by line. |

---

## 1. What identifies a row inside the publisher file?

Seed maps: `lib/mediaplans/ingest/seeds/publisherProfiles.json`. Granularity is `per_row` for all three (each classified buy row is one line). `grouping_keys` are **not** the line identity — they are leftover from the old collapse model and are not used to merge rows.

### QMS (OOH status matrix)

Mapped descriptor columns that name the physical site:

| File header | Canonical | Role |
|---|---|---|
| `SITE NUMBER / NO. OF PANELS` | `site_number` | **Publisher inventory code.** This fixture: `QMN-D345`, `QMN-D369`, `QMN-D161`, … 41/41 unique, none blank. |
| `LATITUDE` / `LONGITUDE` | `latitude` / `longitude` | Location, not a booking ref. |
| `ADDRESS / PACK DETAILS` | `address_or_pack_details` | Address text. Also unique here (41/41 with suburb+format) but it is not a publisher id. |
| `QMS FORMAT` / `FORMAT` / `STATE` / `SUBURB` / `SIZE` / … | format, state, suburb, size, … | Descriptors. |
| `*WEEKLY MARKET RATE …` / `PROD` / `INSTALL` | money / charges | Must not be part of a match key (amendments change money). |
| Flight grid letters (`p` / `B` / `STA` / `N/A`) | bursts / panel flights | Schedule, not identity. |

There is **no** booking-reference / campaign-line-id column. `panel_name` is unmapped and blank on every Paid row.

Accept uses the **Paid** sheet only (`proposeLineItemsFromSheet(primary)`). The workbook also has `QMS_2026_Bonus` (23 rows, 23 unique site codes, **zero overlap** with Paid) and `Campaign MOVE Summary` (ignored by sheet rules). Bonus is not in the accepted 41.

**Pack-header caveat:** the column is named `SITE NUMBER / NO. OF PANELS`. This fixture’s 41 values are all `QMN-*` codes, not panel counts. A pack row that put `6` in that cell would not be a stable id. That shape is not in the fixture; it is why QMS matching is propose-only, not silent apply.

### JCDecaux (OOH status matrix)

| File header | Canonical | Role |
|---|---|---|
| `Panel #` | `site_number` | **Publisher face id** (`03699.01.01`). Unique on 95 real buy rows. Blank on 6 leftover rows. The string `JCDecaux CAMPAIGN SUMMARY` on 5 further rows. |
| `Panel Name` | `panel_name` | Same uniqueness pattern as Panel # in this file (95 unique + 6 blank + 5 summary). A display name, not a booking ref. |
| `Village Name / Panel Weights` | `village_name` | Shared header; weight is not separately mapped. |
| `Suburb / Transit Depot`, `State`, `Area`, `Dimensions`, `Direction`, digital hours/rotation, share-of-time | descriptors | |
| `Lunar (4 week) Market Rate`, `Production Charge`, `Installation Charge`, `MEDIA VALUE (inc. STA)` | money / charges | Not identity. |

There is **no** booking-ref column besides Panel #.

This fixture does **not** list the same Panel # twice with different flights. `hydrateEditorCard` notes that collapsing by site+format+market was the old grouped model; empirically Panel # does not repeat among the 95. If a future JCD export listed one face as two buy rows, Panel # would collide — at that point those rows cannot be auto-matched either. Do not add flight dates to the key to paper over that.

The 11 non-keyed rows (INVESTMENT subtotals and CAMPAIGN SUMMARY banners) have grid occupancy but no panel/grouping identity and no legend-status cell. `retainBuyDataRows` drops them from `data_rows`; they are named unparsed leftovers, not lines.

### SCA (radio spot-count grid)

| File header | Canonical | Role |
|---|---|---|
| *(none — station)* | `station` | **Grouping-row stack**, not a column. `template_coverage` source kind is `grouping_rows`. |
| `Media Description` | `media_description` | e.g. `Brand Commercial` / `Brand Commercial - BONUS`. |
| `Daypart` | `daypart` | e.g. `BMAD 0530-1900`, `BTA 0530-2400` (v1) / `ROS 0530-2400` (v2). **Labels moved between revisions.** |
| `Length` | `length` | e.g. `30 sec`. Required for uniqueness in v2 (same station+daypart+desc appears at two lengths). |
| `Client Total` | `media_amount:stated` | Money. Not identity. |
| `Market Rate` / `Market Total` / `Total Stations` / `Total Impacts` / `Client Rate` | `reference:ignore` | Acknowledged, not imported. |
| Week-number grid | bursts (count) | Schedule. |

There is **no** booking number, order line, or station-spot id. Station names like `Triple M 1152 Wagga` repeat: each station has a paid row and a bonus row (v1: 11 stations × 2 + 1 header-ish row = 23). Station alone is not a key.

v1 includes one non-buy row (`Boss Engineering!r10`: daypart=`Daypart`, desc=`BROADCAST AUDIO`, length=`Length`, no station) that still became a proposed line because the week grid is populated.

---

## 2. What we mint on accept — derived from position, not file content

Proposal path never writes an id (`lib/mediaplans/ingest/proposeLineItems.ts` header: “never mints `line_item_id`”).

On accept:

| Step | File:line | What |
|---|---|---|
| Stamp stubs | `stampProposalForSave.ts:266-291` | `lineItemId: ""`, `position: index + 1` (proposal order). |
| Mint ids | `stampProposalForSave.ts:304` → `assignStableLineItemNumbers` | Empty id claims no number, so every ingest line gets **the next integer from 1**. |
| Rebuild | `lineItemOrder.ts:20-42` / `70-110` | `{mba}{OH\|RA}{n}` via `buildLineItemId`. First ingest of 41 QMS lines → `…OH1` … `…OH41` in file order. |
| Panel provenance | `proposeLineItems.ts:287` | `source_row_ref = "{sheet_name}!r{row}"` — Excel row index in the matrix. |
| Persist panels | `stampProposalForSave.ts:239` + `insertIngestPanels.ts:8-12` | `line_item_panels.source_row_ref` stores that positional ref (plus optional `RAW:` extras). `site_number` / `panel_name` store the publisher columns when present. |

`assignStableLineItemNumbers` *would* preserve an existing number on a later editor save. Ingest never supplies one, so the stable-number path does not help an amendment. A second ingest of the same file, even byte-identical, is a new empty-id list and mints `OH1…n` again. If those land on the same MBA they collide with or sit beside the first accept.

**Position-derived identity is not stable across an amendment.** Inserting a row near the top, deleting a row, or reordering the sheet changes both `line_item_id` and `source_row_ref` for every row after the edit (and for reorder, almost every row).

Durable publisher identity after accept, when the column was mapped, is `line_item_panels.site_number` (QMS / JCD) and radio `attrs.station` + card fields (SCA) — not the minted id.

0050 retained `IngestReviewPackage` keeps the accepted proposal (descriptors + `source_row_ref`). That snapshot is useful as the *left* side of a content diff. The `source_row_ref` values inside it are still positional and must not be the join key to a new file.

---

## 3. Simulated amendment (money change + delete + add + reorder)

Method: take the proposed lines; add $123.45 to row 0’s first burst; drop the last row; prepend a synthetic row; reverse the array. Greedy unique-key match (ambiguous keys are not paired — same doctrine as “never guess”).

### QMS Paid (41)

| Key | Unique in snapshot | After simulated amend |
|---|---|---|
| `source_row_ref` | 41/41 | 40/41 (deleted old last + new synthetic unmatched). Money change does not break this key — but the key is positional, so it only survived because we did not rewrite Excel row numbers, we only shuffled the in-memory array. A real inserted Excel row *would* shift `!rN`. |
| **`site_number`** | **41/41** | 39/41 unique matches. One extra miss vs source_row_ref because the synthetic row copied grouping and collided on the mutated row’s site until descriptors overrode — the ambiguous/unmatched remainder is the deleted + added pair. Money change did not break `site_number`. |
| Full content including money | 41/41 | 39/41 (money-edited row + deleted/added). |
| Content excluding money | 41/41 | 40/41 (deleted/added only). |

**Match rate on publisher key after this amend: 39/41 unique `site_number` hits; 2 unmatched (the deleted row and the added row).** No ambiguous QMS site codes in this fixture.

### JCDecaux (106)

| Key | Unique in snapshot | After simulated amend |
|---|---|---|
| `source_row_ref` | 106/106 | 105/106 (positional, same caveat as QMS). |
| **`Panel #` / `site_number`** | **95/106** (11 unusable) | 94/106 unique matches; 12 unmatched; 6 ambiguous keys (the leftover groups). |
| Content excluding money | 95/106 | 95/106 matched with 11 ambiguous leftover groups — the greedy matcher refuses those groups. |

**Match rate on Panel #: 94 unique hits on a 106-row file is not a file-level match.** The 11 leftover rows never had a key. Auto-apply of the workbook would skip or mis-handle them.

### SCA v2-rev (45 proposed; user-facing “23-line” fixture is v1)

v1 (23) composite `station|daypart|media_description|length` is unique (0 duplicate groups), including the header-ish row.

Simulated amend on v2 (45): that composite matched 43/45 with 1 ambiguous key (synthetic cloned grouping). Station alone is not a key (8 collision groups).

**Real amendment (v1 → v2-rev), not simulated:**

| Key | matched / v1=23 | unmatched A | unmatched B |
|---|---|---|---|
| `source_row_ref` | 11/23 | 12 | 34 |
| `station+daypart+desc+length` | **12/23** | 11 | 33 |
| content excluding money | 1/23 | 22 | 44 |
| Positional same-index | 3/23 same `!rN`; 2/23 same composite; 12/23 same money | | |

v2 has 45 lines vs 23. Bonus dayparts renamed `BTA 0530-2400` → `ROS 0530-2400`. Week grids changed (content hash almost never matches). **A real SCA revision is not a money-only overlay.** The composite that is unique *inside* one file does not survive the publisher’s own next export.

---

## 4. Reorder alone, no content change

Reverse the proposal array, stamp with the same MBA, join new vs old by `source_row_ref`.

| Fixture | Same `line_item_id` after reverse | Content match by publisher key |
|---|---|---|
| QMS 41 | **1/41** (the middle row of an odd-length reverse) | `site_number` 41/41, 0 ambiguous |
| JCD 106 | **0/106** | `Panel #` 95/106, 5 ambiguous leftover keys; 11 unmatched |
| SCA 45 | **1/45** | composite 45/45 (v2 snapshot, including junk row) |

**Reorder is the cheapest failure mode and it already happens.** Ingest identity follows array order. A publisher who sorts by suburb, or Excel who inserts a blank row, restamps every subsequent `{mba}OH{n}`. Matching by `site_number` / Panel # / SCA composite (within one snapshot) is unaffected by reorder; matching by `line_item_id` or `source_row_ref` is destroyed.

---

## 5. Recommended matching key, confidence, apply policy

Confidence is **this-fixture uniqueness**, not a vendor guarantee. One workbook per publisher.

### QMS — `site_number` (`SITE NUMBER / NO. OF PANELS`)

- **Confidence: high on this Paid fixture (41/41 unique `QMN-*` codes).** Bonus sheet in the same workbook is 23 further unique codes with no overlap; current accept never reads it.
- **Automatic apply: not safe.** Reasons: single fixture; header can mean panel count; only Paid is accepted; a wrong UPDATE duplicates the client schedule.
- **Human gate:** show a diff keyed by `site_number` → existing `line_item_panels.site_number`. Unique hits can be accepted as a batch. Adds/deletes/unmatched stay explicit. Do not join on `line_item_id` or `!rN`.

### JCDecaux — `site_number` (`Panel #`) for rows that have a real face id

- **Confidence: high on 95/106 face ids in this fixture; zero on the other 11.**
- **Automatic apply: not safe.** Stop condition: those 11 have no stable key. Do not match them by suburb, MEDIA BOUGHT RATE, or “row near the previous Panel #”.
- **Human gate:** suggest Panel # matches for the 95. Force line-by-line (or skip-as-leftover) for blanks and `CAMPAIGN SUMMARY` rows. If a later file repeats a Panel #, refuse auto-match for that key — do not add flights to the key to break the tie.

### SCA — no stable key

- **Confidence: none for auto-apply.** The only unique composite in a snapshot (`station` from grouping rows + `daypart` + `media_description` + `length`) failed a real publisher revision (12/23). Daypart vocabulary is not a contract.
- **This publisher cannot be auto-amended.** An amendment UI can still *display* a guessed pairing as a hint, but applying it must be human-confirmed **line by line**. No invented booking id.

---

## What an amendment flow must not do

- Re-run accept and let `assignStableLineItemNumbers` mint a parallel `OH1…n` / `RA1…n` on the same MBA.
- Join on `source_row_ref` / Excel row / proposal index.
- Treat leftover occupancy rows (JCD summary / SCA header-ish grid rows) as keyed inventory.
- Paper over SCA daypart renames with fuzzy string match.

Viable path, when a publisher key exists: retained 0050 package + `line_item_panels.site_number` (QMS, JCD-95) as the left side; new ingest proposal descriptors as the right side; human confirm; UPDATE in place. SCA waits until a publisher-side line id exists in the file — it does not, in these fixtures.
