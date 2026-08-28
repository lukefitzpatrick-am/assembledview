# Stage 2 — Expert bursts_json read path & `fee: 0` cleanup

## Files modified

| File | Changes (approximate line ranges after edit) |
|------|-----------------------------------------------|
| `lib/mediaplan/expertChannelMappings.ts` | Imports **17–22**; `BURST_JSON_MONEY_FORMAT` **46–51**; `normalizeOohBursts` doc + implementation **560–629**; removed **`fee: 0`** from burst literals across **~659–6372** (see table below). |
| `STAGE_2_SUMMARY.md` | This file (new). |

**Note:** The working tree may still show unrelated edits (e.g. `app/api/kpis/campaign/route.ts`, `lib/api/kpi.ts`, mediaplan pages) from work outside Stage 2. Stage 2 implementation touched only `expertChannelMappings.ts` plus this summary.

**Test files:** None modified (per spec).

---

## Part A — `normalizeOohBursts`

- Reads **`feeAmount`** (string or number) via `parseMoneyInput`; numeric **`fee`** is used only when `feeAmount` is absent or blank after trim (not when `feeAmount` is present but fails to parse).
- Reads **`mediaAmount`** when present and parseable; sets burst **`budget`** to `formatMoney(parsed, BURST_JSON_MONEY_FORMAT)` (en-AU / AUD, aligned with `serializeBurstsJson`). Otherwise **`budget`** stays `String(rec.budget ?? "")`.
- **`StandardMediaBurst`** unchanged (option **(i)**): no `mediaAmount` / `feeAmount` on the type; fee is still optional **`fee?: number`**.
- **Delegating normalizers:** All channel-specific `normalize*Bursts` functions in this file delegate to `normalizeOohBursts` (`normalizeRadioBursts`, `normalizeTelevisionBursts`, `normalizeBvodBursts`, `normalizeDigiVideoBursts`, `normalizeDigiDisplayBursts`, `normalizeDigiAudioBursts`, `normalizeSocialMediaBursts`, `normalizeSearchBursts`, `normalizeInfluencersBursts`, `normalizeIntegrationBursts`, `normalizeNewspaperBursts`, `normalizeMagazineBursts`, `normalizeProgAudioBursts`, `normalizeProgBvodBursts`, `normalizeProgDisplayBursts`, `normalizeProgVideoBursts`, `normalizeProgOohBursts`). No separate burst parser needed elsewhere.

---

## Part B — `fee: 0` occurrences (audit: 33)

Fresh count before removal: **33** (30 lines matched one pattern; **3** additional lines used a different indent for `fee: 0` in the same file — the initial single-pattern grep undercounted).

| # | Former line | Classification | Disposition |
|---|-------------|----------------|-------------|
| 1 | 617 | X — `emptyOohLineItem` default burst | Removed |
| 2 | 659 | X — `emptyRadioLineItem` | Removed |
| 3 | 764 | Y — `mapOohExpertRowsToStandardLineItems` burst push | Removed |
| 4 | 885 | Y — `mapRadioExpertRowsToStandardLineItems` | Removed |
| 5 | 911 | Y — `mapRadioExpertRowsToStandardLineItems` | Removed |
| 6 | 1396 | X — `emptyTelevisionLineItem` | Removed |
| 7 | 1477 | Y — `mapTvExpertRowsToStandardLineItems` | Removed |
| 8 | 1793 | X — `emptyBvodLineItem` | Removed |
| 9 | 1872 | Y — `mapBvodExpertRowsToStandardLineItems` | Removed |
| 10 | 2165 | X — `emptyDigiVideoLineItem` | Removed |
| 11 | 2251 | Y — `mapDigiVideoExpertRowsToStandardLineItems` | Removed |
| 12 | 2555 | X — `emptyDigiDisplayLineItem` | Removed |
| 13 | 2640 | Y — `mapDigiDisplayExpertRowsToStandardLineItems` | Removed |
| 14 | 2937 | X — `emptyDigiAudioLineItem` | Removed |
| 15 | 3017 | Y — `mapDigiAudioExpertRowsToStandardLineItems` | Removed |
| 16 | 3303 | X — `emptySocialMediaLineItem` | Removed |
| 17 | 3389 | Y — `mapSocialMediaExpertRowsToStandardLineItems` | Removed |
| 18 | 3672 | X — `emptySearchLineItem` | Removed |
| 19 | 3757 | Y — `mapSearchExpertRowsToStandardLineItems` | Removed |
| 20 | 4049 | X — `emptyInfluencersLineItem` | Removed |
| 21 | 4130 | Y — `mapInfluencersExpertRowsToStandardLineItems` | Removed |
| 22 | 4430 | X — `emptyIntegrationLineItem` | Removed |
| 23 | 4511 | Y — `mapIntegrationExpertRowsToStandardLineItems` | Removed |
| 24 | 4753 | X — `emptyNewspaperLineItem` | Removed |
| 25 | 4834 | Y — `mapNewspaperExpertRowsToStandardLineItems` | Removed |
| 26 | 5083 | X — `emptyMagazineLineItem` | Removed |
| 27 | 5164 | Y — `mapMagazineExpertRowsToStandardLineItems` | Removed |
| 28 | 5461 | Y — `buildBurstsFromProgExpertLikeRow` | Removed |
| 29 | 5625 | X — `emptyProgAudioLineItem` | Removed |
| 30 | 5813 | X — `emptyProgBvodLineItem` | Removed |
| 31 | 5998 | X — `emptyProgDisplayLineItem` | Removed |
| 32 | 6189 | X — `emptyProgVideoLineItem` | Removed |
| 33 | 6388 | X — `emptyProgOohLineItem` | Removed |

- **(Z)** none; nothing flagged or left in place.
- **`StandardMediaBurst.fee`:** Still optional (`fee?: number`).
- **Strict `burst.fee === 0`:** Repo search for `fee === 0` / `burst.fee === 0` in TS/TSX found **no** matches; no behaviour change expected from omitting the key vs explicit zero.

---

## Part C — Unused import

- Removed **`computeBurstAmounts`** import from `./burstAmounts` (was unused in this file).
- Added **`formatMoney`**, **`parseMoneyInput`**, **`MoneyFormatOptions`** from `@/lib/format/money`.

---

## Part D — Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **Pass** (exit 0) |
| `npm run lint` | **Pass** (exit 0); existing warnings in other files; **none** new in `expertChannelMappings.ts` |
| IDE diagnostics on `expertChannelMappings.ts` | **Clean** |

---

## Deviations / audit deltas

1. **Initial `fee: 0` grep** with a single pattern reported **30** lines; the file actually had **33** occurrences because **`buildBurstsFromProgExpertLikeRow`** used a **6-space** indent (`      fee: 0`) vs **8 spaces** elsewhere. All **33** were removed.
2. **Bulk removal** briefly concatenated lines; that was **corrected** so object literals keep normal newlines (no functional change intended).
3. **`feeAmount` present but unparseable:** Fee is omitted rather than falling back to legacy `fee` (stricter reading of “only when no `feeAmount` is present” for non-blank values that do not parse).

---

## Not done (explicitly out of scope)

- `serialize*StandardLineItemsBaseline` in `expertModeSwitch.ts`
- `formatBurstBudget` currency alignment
- `saveProductionLineItems` / ProductionContainer
- Inline `getBursts` in ProgDisplay / Television containers (Stage 3)
- Test file edits
