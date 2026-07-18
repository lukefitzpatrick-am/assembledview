import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import {
  PLANNING_AGE_BANDS,
  PLANNING_GENDERS,
  PLANNING_STATES,
  type AudienceAggregateRow,
  type AudienceRequest,
  type PlanningBench,
  type PlanningChannelMeta,
  type PlanningMeta,
  type PlanningMethodologyRow,
  type PlanningSegment,
  type PlanningWave,
  type ReachBasis,
} from "./types"

const MART = "ASSEMBLEDVIEW.MART"

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const s = value.trim().toLowerCase()
    return s === "true" || s === "1" || s === "yes"
  }
  return Boolean(value)
}

function toStr(value: unknown): string {
  return String(value ?? "").trim()
}

function benchFromRow(row: Record<string, unknown>): PlanningBench {
  // P7-8: do not wire a single SOURCE into all four pillars — prefer ATTN_SOURCE /
  // BRAND_EFFECT_SOURCE / DIRECT_EFFECT_SOURCE / CPM_SOURCE when warehouse ships them.
  return {
    attn: toNumberOrNull(row.ATTN ?? row.attn),
    brand_effect: toNumberOrNull(row.BRAND_EFFECT ?? row.brand_effect),
    direct_effect: toNumberOrNull(row.DIRECT_EFFECT ?? row.direct_effect),
    cpm: toNumberOrNull(row.CPM ?? row.cpm),
  }
}

type WaveRow = {
  WAVE_ID: string
  LABEL: string
  LOADED_AT: string | null
  SOURCE_FILES: string | null
}

type SegmentRow = {
  SEGMENT_ID: string
  NAME: string
  IS_INTERSECTION: unknown
  NOTES: string | null
}

type ChannelRow = {
  CHANNEL_ID: string
  LEVEL1: string | null
  LEVEL2: string | null
  SORT_ORDER: unknown
  IS_RM_MEASURED: unknown
  AGE_BASE: unknown
  ENGINE_CHANNEL_ID: string | null
  ATTN: unknown
  BRAND_EFFECT: unknown
  DIRECT_EFFECT: unknown
  CPM: unknown
}

type MethodologyRow = {
  METHODOLOGY_ID: string
  TITLE: string
  FORMULA_TEXT: string | null
  DESCRIPTION: string | null
  DATA_SOURCE: string | null
  SORT_ORDER: unknown
  UPDATED_AT: string | null
}

type EngineParamRow = {
  PARAM_KEY: string
  PARAM_VALUE: unknown
}

type FactAggRow = {
  CHANNEL_ID: string
  SELECTION_WC: unknown
  SELECTION_NULL_COUNT: unknown
  SELECTION_UNWEIGHTED: unknown
  BASE_WC: unknown
  SELECTION_WC_ADDRESSABLE: unknown
  SELECTION_WC_TOTAL: unknown
  BASE_WC_ADDRESSABLE: unknown
  BASE_WC_TOTAL: unknown
}

async function safeQuery<T>(
  label: string,
  run: () => Promise<T[] | null | undefined>
): Promise<T[]> {
  try {
    return (await run()) ?? []
  } catch (err) {
    console.warn(`[planning/queries] ${label} unavailable:`, err)
    return []
  }
}

/**
 * Waves, segments, channels (+ benchmarks LEFT JOIN), methodology, engine params,
 * and static state/age/gender lists. Compose metadata only — no fact maths here.
 */
export async function getPlanningMeta(opts?: {
  requestId?: string
  signal?: AbortSignal
}): Promise<PlanningMeta> {
  const [wavesRaw, segmentsRaw, channelsRaw, methodologyRaw, engineParamsRaw] =
    await Promise.all([
      querySnowflake<WaveRow>(
        `
      SELECT
        WAVE_ID,
        LABEL,
        TO_VARCHAR(LOADED_AT) AS LOADED_AT,
        SOURCE_FILES
      FROM ${MART}.PLANNING_DIM_WAVE
      ORDER BY LOADED_AT DESC NULLS LAST, WAVE_ID
      `,
        [],
        { requestId: opts?.requestId, signal: opts?.signal, label: "planning_meta_waves" }
      ),
      querySnowflake<SegmentRow>(
        `
      SELECT
        SEGMENT_ID,
        NAME,
        IS_INTERSECTION,
        NOTES
      FROM ${MART}.PLANNING_DIM_SEGMENT
      ORDER BY NAME
      `,
        [],
        { requestId: opts?.requestId, signal: opts?.signal, label: "planning_meta_segments" }
      ),
      querySnowflake<ChannelRow>(
        `
      SELECT
        c.CHANNEL_ID,
        c.LEVEL1,
        c.LEVEL2,
        c.SORT_ORDER,
        c.IS_RM_MEASURED,
        c.AGE_BASE,
        c.ENGINE_CHANNEL_ID,
        b.ATTN,
        b.BRAND_EFFECT,
        b.DIRECT_EFFECT,
        b.CPM
      FROM ${MART}.PLANNING_DIM_CHANNEL c
      LEFT JOIN ${MART}.PLANNING_CHANNEL_BENCH b
        ON b.CHANNEL_ID = c.CHANNEL_ID
      ORDER BY c.SORT_ORDER ASC NULLS LAST, c.CHANNEL_ID
      `,
        [],
        { requestId: opts?.requestId, signal: opts?.signal, label: "planning_meta_channels" }
      ),
      safeQuery<MethodologyRow>("planning_meta_methodology", () =>
        querySnowflake<MethodologyRow>(
          `
        SELECT
          METHODOLOGY_ID,
          TITLE,
          FORMULA_TEXT,
          DESCRIPTION,
          DATA_SOURCE,
          SORT_ORDER,
          TO_VARCHAR(UPDATED_AT) AS UPDATED_AT
        FROM ${MART}.PLANNING_METHODOLOGY
        ORDER BY SORT_ORDER ASC NULLS LAST, METHODOLOGY_ID
        `,
          [],
          {
            requestId: opts?.requestId,
            signal: opts?.signal,
            label: "planning_meta_methodology",
          }
        )
      ),
      safeQuery<EngineParamRow>("planning_meta_engine_params", () =>
        querySnowflake<EngineParamRow>(
          `
        SELECT
          PARAM_KEY,
          PARAM_VALUE
        FROM ${MART}.PLANNING_ENGINE_PARAMS
        ORDER BY PARAM_KEY
        `,
          [],
          {
            requestId: opts?.requestId,
            signal: opts?.signal,
            label: "planning_meta_engine_params",
          }
        )
      ),
    ])

  const waves: PlanningWave[] = (wavesRaw ?? []).map((r) => ({
    wave_id: toStr(r.WAVE_ID),
    label: toStr(r.LABEL),
    loaded_at: r.LOADED_AT == null ? null : toStr(r.LOADED_AT),
    source_files: r.SOURCE_FILES == null ? null : toStr(r.SOURCE_FILES),
  }))

  const segments: PlanningSegment[] = (segmentsRaw ?? []).map((r) => ({
    segment_id: toStr(r.SEGMENT_ID),
    name: toStr(r.NAME),
    is_intersection: toBool(r.IS_INTERSECTION),
    notes: r.NOTES == null ? null : toStr(r.NOTES),
  }))

  const channels: PlanningChannelMeta[] = (channelsRaw ?? []).map((r) => ({
    channel_id: toStr(r.CHANNEL_ID),
    level1: r.LEVEL1 == null ? null : toStr(r.LEVEL1),
    level2: r.LEVEL2 == null ? null : toStr(r.LEVEL2),
    sort_order: toNumber(r.SORT_ORDER),
    is_rm_measured: toBool(r.IS_RM_MEASURED),
    age_base: toNumber(r.AGE_BASE, 14),
    engine_channel_id: r.ENGINE_CHANNEL_ID == null ? null : toStr(r.ENGINE_CHANNEL_ID),
    bench: benchFromRow(r as unknown as Record<string, unknown>),
  }))

  const methodology: PlanningMethodologyRow[] = methodologyRaw.map((r) => ({
    methodology_id: toStr(r.METHODOLOGY_ID),
    title: toStr(r.TITLE),
    formula_text: r.FORMULA_TEXT == null ? "" : toStr(r.FORMULA_TEXT),
    description: r.DESCRIPTION == null ? "" : toStr(r.DESCRIPTION),
    data_source: r.DATA_SOURCE == null ? "" : toStr(r.DATA_SOURCE),
    sort_order: toNumber(r.SORT_ORDER),
    updated_at: r.UPDATED_AT == null ? null : toStr(r.UPDATED_AT),
  }))

  const engine_params: Record<string, number> = {}
  for (const r of engineParamsRaw) {
    const key = toStr(r.PARAM_KEY)
    const value = toNumberOrNull(r.PARAM_VALUE)
    if (key && value != null) engine_params[key] = value
  }

  return {
    waves,
    segments,
    channels,
    states: PLANNING_STATES,
    age_bands: PLANNING_AGE_BANDS,
    genders: PLANNING_GENDERS,
    methodology,
    engine_params,
  }
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ")
}

/**
 * One aggregation over PLANNING_FACT_REACH for the selection plus base/NAT reference.
 * Composes on wc_* only (never v_pct_*).
 */
export async function getAudienceProfile(
  params: AudienceRequest,
  opts?: { requestId?: string; signal?: AbortSignal }
): Promise<AudienceAggregateRow[]> {
  const states = params.states
  const genders =
    params.genders.length > 0 ? params.genders : [...PLANNING_GENDERS]
  const ageBands =
    params.age_bands.length > 0 ? params.age_bands : [...PLANNING_AGE_BANDS]
  const basis: ReachBasis = params.reach_basis

  // Bound IN-lists via ? placeholders (same pattern as search-campaigns-pacing).
  const statePh = placeholders(states.length)
  const genderPh = placeholders(genders.length)
  const agePh = placeholders(ageBands.length)

  // Selection predicate reused in CASE expressions (binds repeated per CASE).
  // reach_basis picks the wc column via bound string — never interpolates identifiers.
  const selectionPred = `
          f.SEGMENT_ID = ?
            AND f.STATE IN (${statePh})
            AND f.GENDER IN (${genderPh})
            AND f.AGE_BAND IN (${agePh})`

  const sql = `
    SELECT
      f.CHANNEL_ID AS CHANNEL_ID,
      SUM(
        CASE
          WHEN ${selectionPred}
          THEN IFF(? = 'addressable', f.WC_ADDRESSABLE, f.WC_TOTAL)
          ELSE NULL
        END
      ) AS SELECTION_WC,
      SUM(
        CASE
          WHEN ${selectionPred}
            AND IFF(? = 'addressable', f.WC_ADDRESSABLE, f.WC_TOTAL) IS NULL
          THEN 1
          ELSE 0
        END
      ) AS SELECTION_NULL_COUNT,
      SUM(
        CASE
          WHEN ${selectionPred}
          THEN f.UNWEIGHTED
          ELSE NULL
        END
      ) AS SELECTION_UNWEIGHTED,
      SUM(
        CASE
          WHEN f.SEGMENT_ID = 'base'
            AND f.STATE = 'NAT'
          THEN IFF(? = 'addressable', f.WC_ADDRESSABLE, f.WC_TOTAL)
          ELSE NULL
        END
      ) AS BASE_WC,
      SUM(
        CASE
          WHEN ${selectionPred}
          THEN f.WC_ADDRESSABLE
          ELSE NULL
        END
      ) AS SELECTION_WC_ADDRESSABLE,
      SUM(
        CASE
          WHEN ${selectionPred}
          THEN f.WC_TOTAL
          ELSE NULL
        END
      ) AS SELECTION_WC_TOTAL,
      SUM(
        CASE
          WHEN f.SEGMENT_ID = 'base'
            AND f.STATE = 'NAT'
          THEN f.WC_ADDRESSABLE
          ELSE NULL
        END
      ) AS BASE_WC_ADDRESSABLE,
      SUM(
        CASE
          WHEN f.SEGMENT_ID = 'base'
            AND f.STATE = 'NAT'
          THEN f.WC_TOTAL
          ELSE NULL
        END
      ) AS BASE_WC_TOTAL
    FROM ${MART}.PLANNING_FACT_REACH f
    WHERE f.WAVE_ID = ?
      AND (
        (
          f.SEGMENT_ID = ?
          AND f.STATE IN (${statePh})
          AND f.GENDER IN (${genderPh})
          AND f.AGE_BAND IN (${agePh})
        )
        OR (
          f.SEGMENT_ID = 'base'
          AND f.STATE = 'NAT'
        )
      )
    GROUP BY f.CHANNEL_ID
    ORDER BY f.CHANNEL_ID
  `

  const selectionBinds = [
    params.segment_id,
    ...states,
    ...genders,
    ...ageBands,
    basis,
  ]

  const selectionDimBinds = [
    params.segment_id,
    ...states,
    ...genders,
    ...ageBands,
  ]

  const selectionUnweightedBinds = selectionDimBinds

  const binds = [
    // SELECTION_WC CASE
    ...selectionBinds,
    // SELECTION_NULL_COUNT CASE
    ...selectionBinds,
    // SELECTION_UNWEIGHTED CASE (no basis — UNWEIGHTED is sample n)
    ...selectionUnweightedBinds,
    // BASE_WC CASE (basis only)
    basis,
    // SELECTION_WC_ADDRESSABLE
    ...selectionDimBinds,
    // SELECTION_WC_TOTAL
    ...selectionDimBinds,
    // BASE_WC_ADDRESSABLE / BASE_WC_TOTAL — no binds
    // WHERE
    params.wave_id,
    params.segment_id,
    ...states,
    ...genders,
    ...ageBands,
  ]

  const rowsRaw = await querySnowflake<FactAggRow>(sql, binds, {
    requestId: opts?.requestId,
    signal: opts?.signal,
    label: "planning_audience_profile",
  })

  return (rowsRaw ?? []).map((r) => ({
    channel_id: toStr(r.CHANNEL_ID),
    selection_wc: toNumber(r.SELECTION_WC, 0),
    selection_null_count: toNumber(r.SELECTION_NULL_COUNT, 0),
    selection_unweighted: toNumber(r.SELECTION_UNWEIGHTED, 0),
    base_wc: toNumber(r.BASE_WC, 0),
    selection_wc_addressable: toNumber(r.SELECTION_WC_ADDRESSABLE, 0),
    selection_wc_total: toNumber(r.SELECTION_WC_TOTAL, 0),
    base_wc_addressable: toNumber(r.BASE_WC_ADDRESSABLE, 0),
    base_wc_total: toNumber(r.BASE_WC_TOTAL, 0),
  }))
}
