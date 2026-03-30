import type { WeeklyGanttWeekColumn } from "../utils/weeklyGanttColumns"

export type { WeeklyGanttWeekColumn }

/**
 * Week column key from {@link buildWeeklyGanttColumnsFromCampaign} (local Sunday, yyyy-MM-dd).
 * Also used as keys in per-week schedule cells.
 */
export type ExpertWeekColumnKey = string

/**
 * Per-week editable cells: quantity (number) or empty string when unused.
 */
export type ExpertWeeklyValues = Record<ExpertWeekColumnKey, number | "">

/** Multi-week block in expert Gantt → one standard burst from first week start to last week end. */
export interface OohExpertMergedWeekSpan {
  id: string
  startWeekKey: string
  endWeekKey: string
  totalQty: number
}

export interface OohExpertScheduleRow {
  id: string
  market: string
  network: string
  format: string
  type: string
  placement: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); burst dates still follow week columns + campaign clamp. */
  startDate: string
  endDate: string
  size: string
  /** @deprecated Panels buy type uses weekly quantities; kept for legacy round-trip only. */
  panels: number | string
  buyingDemo: string
  buyType: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: OohExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for radio expert weekly merges. */
export type RadioExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface RadioExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  network: string
  station: string
  market: string
  placement: string
  duration: string
  format: string
  buyingDemo: string
  buyType: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: RadioExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for television expert weekly merges. */
export type TelevisionExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface TelevisionExpertScheduleRow {
  id: string
  market: string
  network: string
  station: string
  daypart: string
  placement: string
  buyType: string
  buyingDemo: string
  size: string
  /** Line-level TARPs / deliverable summary (burst-level tarps set on apply). */
  tarps: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  startDate: string
  endDate: string
  unitRate: number | string
  grossCost: number
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans: TelevisionExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for BVOD expert weekly merges. */
export type BvodExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface BvodExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  publisher: string
  site: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: BvodExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Digi Video expert weekly merges. */
export type DigiVideoExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface DigiVideoExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  publisher: string
  site: string
  bidStrategy: string
  buyType: string
  placement: string
  size: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: DigiVideoExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Digital Display expert weekly merges. */
export type DigitalDisplayExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface DigitalDisplayExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  publisher: string
  site: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: DigitalDisplayExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Digital Audio expert weekly merges. */
export type DigitalAudioExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface DigitalAudioExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  publisher: string
  site: string
  bidStrategy: string
  buyType: string
  targetingAttribute: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: DigitalAudioExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Social Media expert weekly merges. */
export type SocialMediaExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface SocialMediaExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: SocialMediaExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Search expert weekly merges. */
export type SearchExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface SearchExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: SearchExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Influencers expert weekly merges. */
export type InfluencersExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface InfluencersExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  platform: string
  objective: string
  campaign: string
  bidStrategy: string
  buyType: string
  targetingAttribute: string
  creativeTargeting: string
  /** Standard form field; preserved on expert↔standard round-trip (not shown as a grid column). */
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: InfluencersExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Newspaper expert weekly merges. */
export type NewspaperExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface NewspaperExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  network: string
  publisher: string
  title: string
  buyType: string
  size: string
  format: string
  placement: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: NewspaperExpertMergedWeekSpan[]
}

/** Same shape as {@link OohExpertMergedWeekSpan}; used for Magazines expert weekly merges. */
export type MagazinesExpertMergedWeekSpan = OohExpertMergedWeekSpan

export interface MagazinesExpertScheduleRow {
  id: string
  /** Line-level schedule bounds (ISO yyyy-MM-dd); derived from weekly Gantt + merges. */
  startDate: string
  endDate: string
  network: string
  title: string
  buyType: string
  size: string
  publisher: string
  placement: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: MagazinesExpertMergedWeekSpan[]
}

/** Programmatic expert weekly merges (shared shape). */
export type ProgExpertMergedWeekSpan = OohExpertMergedWeekSpan

/** Programmatic Audio — expert schedule row. */
export interface ProgAudioExpertScheduleRow {
  id: string
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: ProgExpertMergedWeekSpan[]
}

/** Programmatic BVOD — expert schedule row. */
export interface ProgBvodExpertScheduleRow {
  id: string
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: ProgExpertMergedWeekSpan[]
}

/** Programmatic Display — expert schedule row. */
export interface ProgDisplayExpertScheduleRow {
  id: string
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: ProgExpertMergedWeekSpan[]
}

/** Programmatic Video — expert schedule row (placement + size after creative). */
export interface ProgVideoExpertScheduleRow {
  id: string
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  placement: string
  size: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: ProgExpertMergedWeekSpan[]
}

/** Programmatic OOH — expert schedule row (placement + size after creative). */
export interface ProgOohExpertScheduleRow {
  id: string
  startDate: string
  endDate: string
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  placement: string
  size: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  unitRate: number | string
  grossCost: number | string
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: ProgExpertMergedWeekSpan[]
}
