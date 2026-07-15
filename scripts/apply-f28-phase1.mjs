// Applies F-28 Phase 1 memoisation wiring to an ExpertGrid file, mirroring the
// already-wired RadioExpertGrid / OohExpertGrid 1:1.
//
// Strategy: exact block replacements (proven against Radio's before/after) with
// per-channel token substitution. Every replacement asserts an exact match count;
// if any block does not match, the whole file is left untouched and the grid is
// reported as failed (STOP condition for that grid). Files are CRLF on disk; we
// operate in LF internally and restore CRLF on write so only F-28 lines change.
//
// Usage:
//   node scripts/apply-f28-phase1.mjs --dry <Channel>       # dry-run one grid
//   node scripts/apply-f28-phase1.mjs <Channel> [<Channel>] # apply named grids
//   node scripts/apply-f28-phase1.mjs --all                 # apply all remaining

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MC = path.join(__dirname, "..", "components", "media-containers")

/**
 * Per-grid token table. Keys map placeholders used in the block templates below.
 *   ROW      = *ExpertScheduleRow
 *   MAP      = *RowMergeMap
 *   SPAN     = *ExpertMergedWeekSpan
 *   SPANMETA = *RowMergeSpanMeta
 *   DEBUG    = DEBUG_*_MERGE flag
 *   TAG      = "[* merge]" console tag
 *   DERIVE   = derive*ExpertRowScheduleYmdFromRow
 *   FEE      = fee prop name (null when the grid has no fee prop, e.g. Production)
 */
const GRIDS = {
  Cinema: {
    file: "CinemaExpertGrid.tsx",
    ROW: "CinemaExpertScheduleRow", MAP: "CinemaRowMergeMap",
    SPAN: "CinemaExpertMergedWeekSpan", SPANMETA: "CinemaRowMergeSpanMeta",
    DEBUG: "DEBUG_CINEMA_MERGE", TAG: "[Cinema merge]",
    DERIVE: "deriveCinemaExpertRowScheduleYmdFromRow", FEE: "feecinema",
  },
  Television: {
    file: "TelevisionExpertGrid.tsx",
    ROW: "TelevisionExpertScheduleRow", MAP: "TelevisionRowMergeMap",
    SPAN: "TelevisionExpertMergedWeekSpan", SPANMETA: "TelevisionRowMergeSpanMeta",
    DEBUG: "DEBUG_TV_MERGE", TAG: "[TV merge]",
    DERIVE: "deriveTelevisionExpertRowScheduleYmdFromRow", FEE: "feetelevision",
  },
  BVOD: {
    file: "BVODExpertGrid.tsx",
    ROW: "BvodExpertScheduleRow", MAP: "BvodRowMergeMap",
    SPAN: "BvodExpertMergedWeekSpan", SPANMETA: "BvodRowMergeSpanMeta",
    DEBUG: "DEBUG_BVOD_MERGE", TAG: "[BVOD merge]",
    DERIVE: "deriveBvodExpertRowScheduleYmdFromRow", FEE: "feebvod",
  },
  DigitalVideo: {
    file: "DigitalVideoExpertGrid.tsx",
    ROW: "DigiVideoExpertScheduleRow", MAP: "DigiVideoRowMergeMap",
    SPAN: "DigiVideoExpertMergedWeekSpan", SPANMETA: "DigiVideoRowMergeSpanMeta",
    DEBUG: "DEBUG_DIGIVIDEO_MERGE", TAG: "[Digi Video merge]",
    DERIVE: "deriveDigiVideoExpertRowScheduleYmdFromRow", FEE: "feedigivideo",
  },
  DigitalDisplay: {
    file: "DigitalDisplayExpertGrid.tsx",
    ROW: "DigitalDisplayExpertScheduleRow", MAP: "DigitalDisplayRowMergeMap",
    SPAN: "DigitalDisplayExpertMergedWeekSpan", SPANMETA: "DigitalDisplayRowMergeSpanMeta",
    DEBUG: "DEBUG_DIGITALDISPLAY_MERGE", TAG: "[Digital Display merge]",
    DERIVE: "deriveDigitalDisplayExpertRowScheduleYmdFromRow", FEE: "feedigidisplay",
  },
  DigitalAudio: {
    file: "DigitalAudioExpertGrid.tsx",
    ROW: "DigitalAudioExpertScheduleRow", MAP: "DigitalAudioRowMergeMap",
    SPAN: "DigitalAudioExpertMergedWeekSpan", SPANMETA: "DigitalAudioRowMergeSpanMeta",
    DEBUG: "DEBUG_DIGIAUDIO_MERGE", TAG: "[Digital Audio merge]",
    DERIVE: "deriveDigitalAudioExpertRowScheduleYmdFromRow", FEE: "feedigiaudio",
  },
  Search: {
    file: "SearchExpertGrid.tsx",
    ROW: "SearchExpertScheduleRow", MAP: "SearchRowMergeMap",
    SPAN: "SearchExpertMergedWeekSpan", SPANMETA: "SearchRowMergeSpanMeta",
    DEBUG: "DEBUG_SEARCH_MERGE", TAG: "[Search merge]",
    DERIVE: "deriveSearchExpertRowScheduleYmdFromRow", FEE: "feesearch",
  },
  SocialMedia: {
    file: "SocialMediaExpertGrid.tsx",
    ROW: "SocialMediaExpertScheduleRow", MAP: "SocialMediaRowMergeMap",
    SPAN: "SocialMediaExpertMergedWeekSpan", SPANMETA: "SocialMediaRowMergeSpanMeta",
    DEBUG: "DEBUG_SOCIALMEDIA_MERGE", TAG: "[Social Media merge]",
    DERIVE: "deriveSocialMediaExpertRowScheduleYmdFromRow", FEE: "feesocial",
  },
  Influencers: {
    file: "InfluencersExpertGrid.tsx",
    ROW: "InfluencersExpertScheduleRow", MAP: "InfluencersRowMergeMap",
    SPAN: "InfluencersExpertMergedWeekSpan", SPANMETA: "InfluencersRowMergeSpanMeta",
    DEBUG: "DEBUG_INFLUENCERS_MERGE", TAG: "[Influencers merge]",
    DERIVE: "deriveInfluencersExpertRowScheduleYmdFromRow", FEE: "feeinfluencers",
  },
  Integration: {
    file: "IntegrationExpertGrid.tsx",
    ROW: "IntegrationExpertScheduleRow", MAP: "IntegrationRowMergeMap",
    SPAN: "IntegrationExpertMergedWeekSpan", SPANMETA: "IntegrationRowMergeSpanMeta",
    DEBUG: "DEBUG_INTEGRATION_MERGE", TAG: "[Integration merge]",
    DERIVE: "deriveIntegrationExpertRowScheduleYmdFromRow", FEE: "feeintegration",
  },
  Newspaper: {
    file: "NewspaperExpertGrid.tsx",
    ROW: "NewspaperExpertScheduleRow", MAP: "NewspaperRowMergeMap",
    SPAN: "NewspaperExpertMergedWeekSpan", SPANMETA: "NewspaperRowMergeSpanMeta",
    DEBUG: "DEBUG_NEWSPAPER_MERGE", TAG: "[Newspaper merge]",
    DERIVE: "deriveNewspaperExpertRowScheduleYmdFromRow", FEE: "feenewspapers",
  },
  Magazines: {
    file: "MagazinesExpertGrid.tsx",
    ROW: "MagazinesExpertScheduleRow", MAP: "MagazinesRowMergeMap",
    SPAN: "MagazinesExpertMergedWeekSpan", SPANMETA: "MagazinesRowMergeSpanMeta",
    DEBUG: "DEBUG_MAGAZINES_MERGE", TAG: "[Magazines merge]",
    DERIVE: "deriveMagazineExpertRowScheduleYmdFromRow", FEE: "feemagazines",
  },
  Production: {
    file: "ProductionExpertGrid.tsx",
    ROW: "ProductionExpertScheduleRow", MAP: "ProductionRowMergeMap",
    SPAN: "ProductionExpertMergedWeekSpan", SPANMETA: "ProductionRowMergeSpanMeta",
    DEBUG: "DEBUG_PRODUCTION_MERGE", TAG: "[Radio merge]",
    DERIVE: "deriveProductionExpertRowScheduleYmdFromRow", FEE: null,
    noFuzzy: true,
  },
  ProgAudio: {
    file: "ProgAudioExpertGrid.tsx",
    ROW: "ProgAudioExpertScheduleRow", MAP: "ProgAudioRowMergeMap",
    SPAN: "ProgExpertMergedWeekSpan", SPANMETA: "ProgAudioRowMergeSpanMeta",
    DEBUG: "DEBUG_PROGAUDIO_MERGE", TAG: "[Programmatic Audio merge]",
    DERIVE: "deriveProgExpertRowScheduleYmdFromRow", FEE: "feeprogaudio",
  },
  ProgBVOD: {
    file: "ProgBVODExpertGrid.tsx",
    ROW: "ProgBvodExpertScheduleRow", MAP: "ProgBvodRowMergeMap",
    SPAN: "ProgExpertMergedWeekSpan", SPANMETA: "ProgBvodRowMergeSpanMeta",
    DEBUG: "DEBUG_PROGBVOD_MERGE", TAG: "[Programmatic BVOD merge]",
    DERIVE: "deriveProgExpertRowScheduleYmdFromRow", FEE: "feeprogbvod",
  },
  ProgDisplay: {
    file: "ProgDisplayExpertGrid.tsx",
    ROW: "ProgDisplayExpertScheduleRow", MAP: "ProgDisplayRowMergeMap",
    SPAN: "ProgExpertMergedWeekSpan", SPANMETA: "ProgDisplayRowMergeSpanMeta",
    DEBUG: "DEBUG_PROGDISPLAY_MERGE", TAG: "[Programmatic Display merge]",
    DERIVE: "deriveProgExpertRowScheduleYmdFromRow", FEE: "feeprogdisplay",
  },
  ProgVideo: {
    file: "ProgVideoExpertGrid.tsx",
    ROW: "ProgVideoExpertScheduleRow", MAP: "ProgVideoRowMergeMap",
    SPAN: "ProgExpertMergedWeekSpan", SPANMETA: "ProgVideoRowMergeSpanMeta",
    DEBUG: "DEBUG_PROGVIDEO_MERGE", TAG: "[Programmatic Video merge]",
    DERIVE: "deriveProgExpertRowScheduleYmdFromRow", FEE: "feeprogvideo",
  },
  ProgOOH: {
    file: "ProgOOHExpertGrid.tsx",
    ROW: "ProgOohExpertScheduleRow", MAP: "ProgOohRowMergeMap",
    SPAN: "ProgExpertMergedWeekSpan", SPANMETA: "ProgOohRowMergeSpanMeta",
    DEBUG: "DEBUG_PROGOOH_MERGE", TAG: "[Programmatic OOH merge]",
    DERIVE: "deriveProgExpertRowScheduleYmdFromRow", FEE: "feeprogooh",
  },
}

const IMPORT_ADD = `import { MemoExpertGridRow } from "@/components/media-containers/MemoExpertGridRow"
import {
  buildMapsPreservingIdentity,
  finalizeRowsPreservingIdentity,
  mapRowAtIndex,
  normalizeRowsPreservingIdentity,
  updateRowAtIndex,
  type MapBuildCacheEntry,
  type NormalizeRowCacheEntry,
} from "@/lib/mediaplan/expertGridRowPerf"
`

// --- Block templates (LF, canonical Radio structure with {{TOKEN}} placeholders) ---

const A_BEFORE = `  const normalizedRows = useMemo(() => {
    return rows.map((r) => {
      const nextWeekly: ExpertWeeklyValues = {} as ExpertWeeklyValues
      for (const k of weekKeys) {
        const v = r.weeklyValues[k]
        // Expert UX: backend/default zeroes for untouched weeks should render blank.
        nextWeekly[k] = normalizeWeekValueForExpertGridBoundary(v)
      }
      return {
        ...r,
        weeklyValues: nextWeekly,
        mergedWeekSpans: Array.isArray(r.mergedWeekSpans)
          ? r.mergedWeekSpans
          : [],
      }
    })
  }, [rows, weekKeys])

  const rowMergeMaps = useMemo<readonly {{MAP}}[]>(() => {
    const maps = normalizedRows.map((row) => {
      const anchorByWeekKey: Record<string, string> = {}
      const interiorByWeekKey: Record<string, string> = {}
      const spanById: Record<string, {{SPAN}}> = {}
      const spanMetaByAnchorWeekKey: Record<string, {{SPANMETA}}> = {}
      const occupiedWeekKeys = new Set<string>()
      // A row can contain multiple non-overlapping merged groups with gaps.
      // Each accepted span contributes its own anchor/interior occupancy maps.
      for (const span of row.mergedWeekSpans ?? []) {
        if (spanById[span.id]) {
          if ({{DEBUG}}) {
            console.debug("{{TAG}} occupancy duplicate span id ignored", {
              rowId: row.id,
              rowIndex: normalizedRows.indexOf(row),
              spanId: span.id,
            })
          }
          continue
        }
        const keysRaw = weekKeysInSpanInclusive(
          weekKeys,
          span.startWeekKey,
          span.endWeekKey
        )
        const keys = keysRaw.filter((k) => weekKeys.includes(k))
        if (keys.length === 0) continue
        // Prefer first valid span: later overlapping/conflicting spans are ignored.
        if (keys.some((k) => occupiedWeekKeys.has(k))) {
          if ({{DEBUG}}) {
            console.debug("{{TAG}} occupancy overlap ignored", {
              rowId: row.id,
              rowIndex: normalizedRows.indexOf(row),
              spanId: span.id,
              keys,
            })
          }
          continue
        }
        const anchorWeekKey = keys[0]!
        anchorByWeekKey[anchorWeekKey] = span.id
        for (let i = 1; i < keys.length; i += 1) {
          interiorByWeekKey[keys[i]!] = span.id
        }
        for (const key of keys) occupiedWeekKeys.add(key)
        spanById[span.id] = span
        spanMetaByAnchorWeekKey[anchorWeekKey] = Object.freeze({
          id: span.id,
          startWeekKey: span.startWeekKey,
          endWeekKey: span.endWeekKey,
          totalQty: span.totalQty,
          spanLength: keys.length,
          weekKeysIncluded: Object.freeze([...keys]),
        })
      }
      return Object.freeze({
        anchorByWeekKey: Object.freeze(anchorByWeekKey),
        interiorByWeekKey: Object.freeze(interiorByWeekKey),
        spanById: Object.freeze(spanById),
        spanMetaByAnchorWeekKey: Object.freeze(spanMetaByAnchorWeekKey),
      })
    })
    return Object.freeze(maps)
  }, [normalizedRows, weekKeys])`

const A_AFTER = `  const normalizeRowCacheRef = useRef(
    new Map<string, NormalizeRowCacheEntry<{{ROW}}>>()
  )
  const normalizedRows = useMemo(() => {
    const { rows: next, cache } = normalizeRowsPreservingIdentity(
      rows,
      weekKeys,
      (r, keys) => {
        const nextWeekly: ExpertWeeklyValues = {} as ExpertWeeklyValues
        for (const k of keys) {
          const v = r.weeklyValues[k]
          // Expert UX: backend/default zeroes for untouched weeks should render blank.
          nextWeekly[k] = normalizeWeekValueForExpertGridBoundary(v)
        }
        return {
          ...r,
          weeklyValues: nextWeekly,
          mergedWeekSpans: Array.isArray(r.mergedWeekSpans)
            ? r.mergedWeekSpans
            : [],
        }
      },
      normalizeRowCacheRef.current
    )
    normalizeRowCacheRef.current = cache
    return next
  }, [rows, weekKeys])

  const rowMergeMapCacheRef = useRef(
    new Map<
      string,
      MapBuildCacheEntry<
        {{ROW}}["mergedWeekSpans"],
        {{MAP}}
      >
    >()
  )
  const rowMergeMaps = useMemo<readonly {{MAP}}[]>(() => {
    const { maps, cache } = buildMapsPreservingIdentity(
      normalizedRows,
      weekKeys,
      (row) => row.mergedWeekSpans,
      (row) => {
        const anchorByWeekKey: Record<string, string> = {}
        const interiorByWeekKey: Record<string, string> = {}
        const spanById: Record<string, {{SPAN}}> = {}
        const spanMetaByAnchorWeekKey: Record<string, {{SPANMETA}}> = {}
        const occupiedWeekKeys = new Set<string>()
        // A row can contain multiple non-overlapping merged groups with gaps.
        // Each accepted span contributes its own anchor/interior occupancy maps.
        for (const span of row.mergedWeekSpans ?? []) {
          if (spanById[span.id]) {
            if ({{DEBUG}}) {
              console.debug("{{TAG}} occupancy duplicate span id ignored", {
                rowId: row.id,
                spanId: span.id,
              })
            }
            continue
          }
          const keysRaw = weekKeysInSpanInclusive(
            weekKeys,
            span.startWeekKey,
            span.endWeekKey
          )
          const keys = keysRaw.filter((k) => weekKeys.includes(k))
          if (keys.length === 0) continue
          // Prefer first valid span: later overlapping/conflicting spans are ignored.
          if (keys.some((k) => occupiedWeekKeys.has(k))) {
            if ({{DEBUG}}) {
              console.debug("{{TAG}} occupancy overlap ignored", {
                rowId: row.id,
                spanId: span.id,
                keys,
              })
            }
            continue
          }
          const anchorWeekKey = keys[0]!
          anchorByWeekKey[anchorWeekKey] = span.id
          for (let i = 1; i < keys.length; i += 1) {
            interiorByWeekKey[keys[i]!] = span.id
          }
          for (const key of keys) occupiedWeekKeys.add(key)
          spanById[span.id] = span
          spanMetaByAnchorWeekKey[anchorWeekKey] = Object.freeze({
            id: span.id,
            startWeekKey: span.startWeekKey,
            endWeekKey: span.endWeekKey,
            totalQty: span.totalQty,
            spanLength: keys.length,
            weekKeysIncluded: Object.freeze([...keys]),
          })
        }
        return Object.freeze({
          anchorByWeekKey: Object.freeze(anchorByWeekKey),
          interiorByWeekKey: Object.freeze(interiorByWeekKey),
          spanById: Object.freeze(spanById),
          spanMetaByAnchorWeekKey: Object.freeze(spanMetaByAnchorWeekKey),
        })
      },
      rowMergeMapCacheRef.current
    )
    rowMergeMapCacheRef.current = cache
    return maps
  }, [normalizedRows, weekKeys])`

const PUSHROWS_BEFORE = `      const withDates = next.map((r) => {
        // Week-level writes win over day detail (single invariant chokepoint).
        const cleared = clearConflictingDayDetail(r, dayKeysByWeekKey, weekKeys)
        return {
          ...cleared,
          ...{{DERIVE}}(
            cleared,
            weekColumns,
            campaignStartDate,
            campaignEndDate,
            dayKeysByWeekKey
          ),
        }
      })
      onRowsChange(withDates)`

const PUSHROWS_AFTER = `      const withDates = finalizeRowsPreservingIdentity(next, (r) => {
        // Week-level writes win over day detail (single invariant chokepoint).
        const cleared = clearConflictingDayDetail(r, dayKeysByWeekKey, weekKeys)
        const dates = {{DERIVE}}(
          cleared,
          weekColumns,
          campaignStartDate,
          campaignEndDate,
          dayKeysByWeekKey
        )
        if (
          cleared === r &&
          dates.startDate === r.startDate &&
          dates.endDate === r.endDate
        ) {
          return r
        }
        if (
          dates.startDate === cleared.startDate &&
          dates.endDate === cleared.endDate
        ) {
          return cleared
        }
        return { ...cleared, ...dates }
      })
      onRowsChange(withDates)`

const MERGE_HANDLER_BEFORE = `      pushRows(
        normalizedRowsRef.current.map((r, i) => {
          if (i !== rowIndex) return r
          return {
            ...r,
            weeklyValues: { ...result.weeklyValues },
            dailyValues: result.dailyValues,
            mergedWeekSpans: result.mergedWeekSpans
              ? [...result.mergedWeekSpans]
              : r.mergedWeekSpans,
          }
        })
      )`

const MERGE_HANDLER_AFTER = `      const next = mapRowAtIndex(normalizedRowsRef.current, rowIndex, (r) => ({
        ...r,
        weeklyValues: { ...result.weeklyValues },
        dailyValues: result.dailyValues,
        mergedWeekSpans: result.mergedWeekSpans
          ? [...result.mergedWeekSpans]
          : r.mergedWeekSpans,
      }))
      if (next) pushRows(next)`

const REORDER_BEFORE = `      const next = reorderExpertRows(normalizedRows, from, to)
      if (!next) return
      pushRows(next)
      onReorder?.()
    },
    [normalizedRows, pushRows, onReorder]`

const REORDER_AFTER = `      const next = reorderExpertRows(normalizedRowsRef.current, from, to)
      if (!next) return
      pushRows(next)
      onReorder?.()
    },
    [pushRows, onReorder]`

const UPDATEROW_BEFORE = `      const next = normalizedRows.map((r, i) =>
        i === rowIndex ? { ...r, ...patch } : r
      )
      pushRows(next)
    },
    [normalizedRows, pushRows]`

const UPDATEROW_AFTER = `      const next = updateRowAtIndex(
        normalizedRowsRef.current,
        rowIndex,
        patch
      )
      if (!next) return
      pushRows(next)
    },
    [pushRows]`

const FUZZY_BEFORE = `      const targetNorm = value.trim().toLowerCase()
      const next = normalizedRows.map((r) => {
        const cur = String(r[field] ?? "")
        if (cur.trim().toLowerCase() === targetNorm) {
          return { ...r, [field]: matched }
        }
        return r
      })
      pushRows(next)
      setPendingFuzzyMatch(null)
    },
    [pendingFuzzyMatch, normalizedRows, pushRows]`

const FUZZY_AFTER = `      const targetNorm = value.trim().toLowerCase()
      const rowsNow = normalizedRowsRef.current
      let changed = false
      const next = rowsNow.map((r) => {
        const cur = String(r[field] ?? "")
        if (cur.trim().toLowerCase() === targetNorm) {
          changed = true
          return { ...r, [field]: matched }
        }
        return r
      })
      if (changed) pushRows(next)
      setPendingFuzzyMatch(null)
    },
    [pendingFuzzyMatch, pushRows]`

const WEEKLY_A_BEFORE = `      const row = normalizedRows[rowIndex]
      if (!row) return
      const span = findMergedSpanForWeek(row, weekKey, weekKeys)
      if (span && span.startWeekKey !== weekKey) return`

const WEEKLY_A_AFTER = `      const rowsNow = normalizedRowsRef.current
      const row = rowsNow[rowIndex]
      if (!row) return
      const span = findMergedSpanForWeek(row, weekKey, weekKeys)
      if (span && span.startWeekKey !== weekKey) return`

const WEEKLY_B_BEFORE = `      if (cleaned === "" || cleaned === "-") {
        if (span) {
          // Preserve merge topology on edit clear/delete; only the X control unmerges.
          const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
            s.id === span.id ? { ...s, totalQty: 0 } : s
          )
          pushRows(
            normalizedRows.map((r, i) =>
              i === rowIndex ? { ...r, mergedWeekSpans } : r
            )
          )
          return
        }
        const weeklyValues = { ...row.weeklyValues, [weekKey]: "" as const }
        pushRows(
          normalizedRows.map((r, i) =>
            i === rowIndex ? { ...r, weeklyValues } : r
          )
        )
        return
      }
      const n = Number.parseFloat(cleaned)
      if (!Number.isFinite(n)) return
      if (span) {
        const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
          s.id === span.id ? { ...s, totalQty: n } : s
        )
        pushRows(
          normalizedRows.map((r, i) =>
            i === rowIndex ? { ...r, mergedWeekSpans } : r
          )
        )
        return
      }
      const weeklyValues = { ...row.weeklyValues, [weekKey]: n }
      pushRows(
        normalizedRows.map((r, i) => (i === rowIndex ? { ...r, weeklyValues } : r))
      )
    },
    [normalizedRows, pushRows, weekKeys]`

const WEEKLY_B_AFTER = `      if (cleaned === "" || cleaned === "-") {
        if (span) {
          // Preserve merge topology on edit clear/delete; only the X control unmerges.
          const next = mapRowAtIndex(rowsNow, rowIndex, (r) => ({
            ...r,
            mergedWeekSpans: (r.mergedWeekSpans ?? []).map((s) =>
              s.id === span.id ? { ...s, totalQty: 0 } : s
            ),
          }))
          if (next) pushRows(next)
          return
        }
        const next = mapRowAtIndex(rowsNow, rowIndex, (r) => ({
          ...r,
          weeklyValues: { ...r.weeklyValues, [weekKey]: "" as const },
        }))
        if (next) pushRows(next)
        return
      }
      const n = Number.parseFloat(cleaned)
      if (!Number.isFinite(n)) return
      if (span) {
        const next = mapRowAtIndex(rowsNow, rowIndex, (r) => ({
          ...r,
          mergedWeekSpans: (r.mergedWeekSpans ?? []).map((s) =>
            s.id === span.id ? { ...s, totalQty: n } : s
          ),
        }))
        if (next) pushRows(next)
        return
      }
      const next = mapRowAtIndex(rowsNow, rowIndex, (r) => ({
        ...r,
        weeklyValues: { ...r.weeklyValues, [weekKey]: n },
      }))
      if (next) pushRows(next)
    },
    [pushRows, weekKeys]`

const DAILY_A_BEFORE = `      const row = normalizedRows[rowIndex]
      if (!row) return
      // Merged weeks are edited via their anchor cell, never day cells.
      if (findMergedSpanForWeek(row, weekKey, weekKeys)) return`

const DAILY_A_AFTER = `      const rowsNow = normalizedRowsRef.current
      const row = rowsNow[rowIndex]
      if (!row) return
      // Merged weeks are edited via their anchor cell, never day cells.
      if (findMergedSpanForWeek(row, weekKey, weekKeys)) return`

const DAILY_B_BEFORE = `      const weeklyValues = { ...row.weeklyValues, [weekKey]: "" as const }
      pushRows(
        normalizedRows.map((r, i) =>
          i === rowIndex ? { ...r, weeklyValues, dailyValues: nextDaily } : r
        )
      )
    },
    [dayKeysByWeekKey, normalizedRows, pushRows, weekKeys]`

const DAILY_B_AFTER = `      const next = mapRowAtIndex(rowsNow, rowIndex, (r) => ({
        ...r,
        weeklyValues: { ...r.weeklyValues, [weekKey]: "" as const },
        dailyValues: nextDaily,
      }))
      if (next) pushRows(next)
    },
    [dayKeysByWeekKey, pushRows, weekKeys]`

const UNMERGE_BEFORE = `      const row = normalizedRows[rowIndex]
      if (!row) return
      // Dedicated and only destructive merge removal path.
      // Remove only the chosen span; all other merged groups on this row are preserved.
      const mergedWeekSpans = (row.mergedWeekSpans ?? []).filter(
        (span) => span.id !== spanId
      )
      pushRows(
        normalizedRows.map((r, i) =>
          i === rowIndex ? { ...r, mergedWeekSpans } : r
        )
      )
      resetTransientWeekUiState()
      if ({{DEBUG}}) {
        console.debug("{{TAG}} unmerge applied", { rowIndex, spanId })
      }
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]`

const UNMERGE_AFTER = `      const rowsNow = normalizedRowsRef.current
      const row = rowsNow[rowIndex]
      if (!row) return
      // Dedicated and only destructive merge removal path.
      // Remove only the chosen span; all other merged groups on this row are preserved.
      const next = mapRowAtIndex(rowsNow, rowIndex, (r) => ({
        ...r,
        mergedWeekSpans: (r.mergedWeekSpans ?? []).filter(
          (span) => span.id !== spanId
        ),
      }))
      if (next) pushRows(next)
      resetTransientWeekUiState()
      if ({{DEBUG}}) {
        console.debug("{{TAG}} unmerge applied", { rowIndex, spanId })
      }
    },
    [pushRows, resetTransientWeekUiState]`

const ADDROW_BEFORE = `    const next = [...normalizedRows, ...newRows]
    pushRows(next)
    resetTransientWeekUiState()
    setRowCountInput(String(parsed))
  }, [
    campaignStartDate,
    campaignEndDate,
    normalizedRows,
    pushRows,
    resetTransientWeekUiState,
    rowCountInput,`

const ADDROW_AFTER = `    const next = [...normalizedRowsRef.current, ...newRows]
    pushRows(next)
    resetTransientWeekUiState()
    setRowCountInput(String(parsed))
  }, [
    campaignStartDate,
    campaignEndDate,
    pushRows,
    resetTransientWeekUiState,
    rowCountInput,`

const DUP_BODY_BEFORE = `      const next = duplicateExpertRow(
        normalizedRows,
        rowIndex,`

const DUP_BODY_AFTER = `      const next = duplicateExpertRow(
        normalizedRowsRef.current,
        rowIndex,`

const DELETE_BEFORE = `      const next = deleteExpertRow(normalizedRows, rowIndex)
      if (!next) return
      pushRows(next)
      resetTransientWeekUiState()
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]`

const DELETE_AFTER = `      const next = deleteExpertRow(normalizedRowsRef.current, rowIndex)
      if (!next) return
      pushRows(next)
      resetTransientWeekUiState()
    },
    [pushRows, resetTransientWeekUiState]`

// duplicateRow deps — after unmerge + delete have been transformed, this is the
// only remaining occurrence.
const DUP_DEPS_BEFORE = `    [normalizedRows, pushRows, resetTransientWeekUiState]`
const DUP_DEPS_AFTER = `    [pushRows, resetTransientWeekUiState]`

const LAYOUTSIG_HEAD = `  /** Shared layout fingerprint — changes here re-render every memoised row. */
  const layoutSig = useMemo(() => {
    const expanded = [...expandedWeekKeys].sort().join(",")
    const widths = Object.keys(weekColumnWidths)
      .sort()
      .map((k) => \`\${k}:\${weekColumnWidths[k]}\`)
      .join(",")
    return [
      entryMode,
      showBillingCols ? "1" : "0",
      expanded,
      widths,
{{FEE_LINE}}      weekKeys.join(","),
      descriptorColWidths.join(","),
      // Selection overlays span rows — bump all rows when the area selection changes.
      weekStripSelection
        ? \`ss:\${weekStripSelection.rowIndex}\`
        : "",
      weekMultiSelect
        ? \`ms:\${weekMultiSelect.rowIndex}:\${weekMultiSelect.keys.join(",")}\`
        : "",
      weekRectSelection
        ? \`wr:\${weekRectSelection.rowStart}:\${weekRectSelection.rowEnd}:\${weekRectSelection.weekKeyStart}:\${weekRectSelection.weekKeyEnd}\`
        : "",
      multiCellSelection
        ? \`mc:\${multiCellSelection.startRow}:\${multiCellSelection.endRow}:\${multiCellSelection.startCol}:\${multiCellSelection.endCol}\`
        : "",
      pendingMergeSelection
        ? \`pm:\${pendingMergeSelection.rowIndex}:\${pendingMergeSelection.keys.join(",")}\`
        : "",
      weekDragSource ? \`wds:\${weekDragSource.rowIndex}:\${weekDragSource.weekKey}\` : "",
      copiedCells ? "copy" : "",
      isSelecting ? "sel" : "",
    ].join("|")
  }, [
    copiedCells,
    descriptorColWidths,
    entryMode,
    expandedWeekKeys,
{{FEE_DEP}}    isSelecting,
    multiCellSelection,
    pendingMergeSelection,
    showBillingCols,
    weekColumnWidths,
    weekDragSource,
    weekKeys,
    weekMultiSelect,
    weekRectSelection,
    weekStripSelection,
  ])`

const LAYOUTSIG_ANCHOR = `  return (
    <TooltipProvider delayDuration={300}>`

const TBODY_OPEN_ANCHOR = `                    {normalizedRows.map((row, rowIndex) => {
`

const TBODY_OPEN_INJECT = `                      const rowMergeMapForRow =
                        rowMergeMaps[rowIndex] ??
                        ({
                          anchorByWeekKey: {},
                          interiorByWeekKey: {},
                          spanById: {},
                          spanMetaByAnchorWeekKey: {},
                        } as {{MAP}})
                      const rowUiSig = [
                        isDropTarget(rowIndex) ? "1" : "0",
                        dragRowIndex === rowIndex ? "1" : "0",
                        weekDragOver?.rowIndex === rowIndex
                          ? \`wo:\${weekDragOver.weekKey}:\${weekDragOver.valid ? 1 : 0}\`
                          : "",
                        focusedCell?.rowIndex === rowIndex
                          ? \`f:\${focusedCell.columnKey}\`
                          : "",
                        budgetDraft?.rowIndex === rowIndex
                          ? \`bd:\${budgetDraft.cellKey}:\${budgetDraft.text}\`
                          : "",
                        mergeSpanHighlightPulse?.rowIndex === rowIndex
                          ? \`mp:\${mergeSpanHighlightPulse.startWeekKey}:\${mergeSpanHighlightPulse.endWeekKey}\`
                          : "",
                      ].join("|")
                      return (
                        <MemoExpertGridRow
                          key={row.id}
                          row={row}
                          rowIndex={rowIndex}
                          rowMergeMap={rowMergeMapForRow}
                          layoutSig={layoutSig}
                          rowUiSig={rowUiSig}
                          render={() => {
`

const TBODY_CLOSE_BEFORE = `                        </tr>
                      )
                    })}`

const TBODY_CLOSE_AFTER = `                        </tr>
                      )
                          }}
                        />
                      )
                    })}`

function tok(str, g) {
  return str
    .split("{{ROW}}").join(g.ROW)
    .split("{{MAP}}").join(g.MAP)
    .split("{{SPAN}}").join(g.SPAN)
    .split("{{SPANMETA}}").join(g.SPANMETA)
    .split("{{DEBUG}}").join(g.DEBUG)
    .split("{{TAG}}").join(g.TAG)
    .split("{{DERIVE}}").join(g.DERIVE)
    .split("{{FEE}}").join(g.FEE ?? "")
}

function buildLayoutSig(g) {
  const feeLine = g.FEE ? `      String(${g.FEE}),\n` : ""
  const feeDep = g.FEE ? `    ${g.FEE},\n` : ""
  return LAYOUTSIG_HEAD.split("{{FEE_LINE}}").join(feeLine).split("{{FEE_DEP}}").join(feeDep)
}

function makeApplier(errors) {
  return function apply(src, name, beforeRaw, afterRaw, g, expected = 1) {
    const before = tok(beforeRaw, g)
    const after = tok(afterRaw, g)
    const parts = src.split(before)
    const found = parts.length - 1
    if (found !== expected) {
      errors.push(`  ✗ ${name}: expected ${expected} match(es), found ${found}`)
      return src
    }
    return parts.join(after)
  }
}

function transform(g) {
  const errors = []
  const apply = makeApplier(errors)
  const filePath = path.join(MC, g.file)
  const raw = fs.readFileSync(filePath, "utf8")
  const usedCRLF = raw.includes("\r\n")
  let s = raw.replace(/\r\n/g, "\n")

  if (s.includes("MemoExpertGridRow")) {
    return { skipped: true, reason: "already wired (MemoExpertGridRow present)" }
  }

  // 1. Remove the <tr> key (moves to MemoExpertGridRow) — must run before the
  //    tbody-open injection which adds its own key={row.id}.
  {
    const m = s.match(/<tr\n\s+key=\{row\.id\}\n/g)
    if (!m || m.length !== 1) {
      errors.push(`  ✗ tr-key-removal: expected 1 match, found ${m ? m.length : 0}`)
    } else {
      s = s.replace(/<tr\n\s+key=\{row\.id\}\n/, "<tr\n")
    }
  }

  // 2. tbody open wrap (inject MemoExpertGridRow shell + render callback open).
  {
    const inject = tok(TBODY_OPEN_INJECT, g)
    const parts = s.split(TBODY_OPEN_ANCHOR)
    if (parts.length - 1 !== 1) {
      errors.push(`  ✗ tbody-open: expected 1 match, found ${parts.length - 1}`)
    } else {
      s = parts.join(TBODY_OPEN_ANCHOR + inject)
    }
  }

  // 3. tbody close wrap.
  s = apply(s, "tbody-close", TBODY_CLOSE_BEFORE, TBODY_CLOSE_AFTER, g)

  // 4. normalize + rowMergeMaps.
  s = apply(s, "normalize+mergeMaps", A_BEFORE, A_AFTER, g)

  // 5. pushRows finalize.
  s = apply(s, "pushRows", PUSHROWS_BEFORE, PUSHROWS_AFTER, g)

  // 6. merge result handler.
  s = apply(s, "merge-handler", MERGE_HANDLER_BEFORE, MERGE_HANDLER_AFTER, g)

  // 7. handleReorder.
  s = apply(s, "handleReorder", REORDER_BEFORE, REORDER_AFTER, g)

  // 8. updateRow.
  s = apply(s, "updateRow", UPDATEROW_BEFORE, UPDATEROW_AFTER, g)

  // 9. handleFuzzyMatchConfirm (skip for grids with no fuzzy-match handler, e.g. Production).
  if (!g.noFuzzy) {
    s = apply(s, "fuzzyMatchConfirm", FUZZY_BEFORE, FUZZY_AFTER, g)
  }

  // 10. updateWeeklyCell.
  s = apply(s, "updateWeeklyCell-A", WEEKLY_A_BEFORE, WEEKLY_A_AFTER, g)
  s = apply(s, "updateWeeklyCell-B", WEEKLY_B_BEFORE, WEEKLY_B_AFTER, g)

  // 11. updateDailyCell.
  s = apply(s, "updateDailyCell-A", DAILY_A_BEFORE, DAILY_A_AFTER, g)
  s = apply(s, "updateDailyCell-B", DAILY_B_BEFORE, DAILY_B_AFTER, g)

  // 12. unmergeWeekSpan (also converts its own deps).
  s = apply(s, "unmergeWeekSpan", UNMERGE_BEFORE, UNMERGE_AFTER, g)

  // 13. deleteRow (also converts its own deps).
  s = apply(s, "deleteRow", DELETE_BEFORE, DELETE_AFTER, g)

  // 14. addRow.
  s = apply(s, "addRow", ADDROW_BEFORE, ADDROW_AFTER, g)

  // 15. duplicateRow body + deps (deps now unique after unmerge/delete handled).
  s = apply(s, "duplicateRow-body", DUP_BODY_BEFORE, DUP_BODY_AFTER, g)
  s = apply(s, "duplicateRow-deps", DUP_DEPS_BEFORE, DUP_DEPS_AFTER, g)

  // 16. layoutSig insertion.
  s = apply(s, "layoutSig", LAYOUTSIG_ANCHOR, buildLayoutSig(g) + "\n\n" + LAYOUTSIG_ANCHOR, g)

  // 17. imports.
  s = apply(s, "imports", `} from "react"\n`, `} from "react"\n` + IMPORT_ADD, g)

  if (errors.length) {
    return { failed: true, errors }
  }

  const out = usedCRLF ? s.replace(/\n/g, "\r\n") : s
  return { ok: true, content: out, filePath }
}

// --- CLI ---
const args = process.argv.slice(2)
const dry = args.includes("--dry")
const all = args.includes("--all")
const names = args.filter((a) => !a.startsWith("--"))

const targets = all ? Object.keys(GRIDS) : names
if (targets.length === 0) {
  console.error("No target grids. Pass channel names or --all.")
  process.exit(1)
}

let anyFail = false
for (const name of targets) {
  const g = GRIDS[name]
  if (!g) {
    console.error(`Unknown grid: ${name}`)
    anyFail = true
    continue
  }
  const res = transform(g)
  if (res.skipped) {
    console.log(`- ${name}: SKIP (${res.reason})`)
    continue
  }
  if (res.failed) {
    anyFail = true
    console.log(`✗ ${name}: FAILED`)
    for (const e of res.errors) console.log(e)
    continue
  }
  if (dry) {
    console.log(`✓ ${name}: all replacements matched (dry-run, not written)`)
  } else {
    fs.writeFileSync(res.filePath, res.content, "utf8")
    console.log(`✓ ${name}: wrote ${g.file}`)
  }
}

process.exit(anyFail ? 1 : 0)
