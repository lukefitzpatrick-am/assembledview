/**
 * Channel expected is the delivery-schedule media split at the same as-of
 * as resolveCampaignExpectedSpendToDate. Assumed-spend lines replace their
 * share of that slice with assumedDailyCents through the as-of. Line expected
 * shown on a reported line is the remainder, allocated by lineExpectedNetToDate
 * (planned media when that sum is 0), largest-remainder to the cent.
 */
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { fromCents, roundMoney2, toCents } from "@/lib/money/cents"
import {
  assumedLineToDateCents,
  isAssumedValueAddBuyType,
  type AssumedExpectedLine,
} from "@/lib/spend/assumedSpend"
import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  expectedSpendToDateFromMonthlyCalendar,
  monthlySpendArrayFromDeliverySchedule,
  totalPlannedSpendFromMonthly,
  type MonthlyPlanCampaignOpts,
} from "@/lib/spend/monthlyPlanCalendar"

const NON_MEDIA = new Set(["fees", "production", "ad serving", "ad serving & tech"])

const TYPE_TO_SCHEDULE: Record<string, string> = {
  television: "television",
  radio: "radio",
  newspaper: "newspaper",
  magazines: "magazines",
  ooh: "ooh",
  cinema: "cinema",
  digiDisplay: "digital-display",
  digitalDisplay: "digital-display",
  digiAudio: "digital-audio",
  digitalAudio: "digital-audio",
  digiVideo: "digital-video",
  digitalVideo: "digital-video",
  bvod: "bvod",
  integration: "integration",
  search: "search",
  socialMedia: "social",
  social: "social",
  progDisplay: "programmatic-display",
  progVideo: "programmatic-video",
  progBvod: "programmatic-bvod",
  progBVOD: "programmatic-bvod",
  progAudio: "programmatic-audio",
  progOoh: "programmatic-ooh",
  progOOH: "programmatic-ooh",
  influencers: "influencers",
}

const KEY_LABELS: Record<string, string> = {
  social: "Social",
  search: "Search",
  "digital-display": "Digital Display",
  "digital-video": "Digital Video",
  "digital-audio": "Digital Audio",
  bvod: "BVOD",
  "programmatic-display": "Programmatic Display",
  "programmatic-video": "Programmatic Video",
  "programmatic-audio": "Programmatic Audio",
  "programmatic-bvod": "Programmatic BVOD",
  "programmatic-ooh": "Programmatic OOH",
  newspaper: "Newspaper",
  television: "Television",
  radio: "Radio",
  magazines: "Magazines",
  cinema: "Cinema",
  ooh: "OOH",
  integration: "Integration",
  influencers: "Influencers",
}

const LABEL_ALIASES: Record<string, string> = {
  social: "social",
  "social media": "social",
  search: "search",
  "digital display": "digital-display",
  "digital video": "digital-video",
  "digital audio": "digital-audio",
  bvod: "bvod",
  "programmatic display": "programmatic-display",
  "programmatic video": "programmatic-video",
  "prog video": "programmatic-video",
  "prog display": "programmatic-display",
  "programmatic audio": "programmatic-audio",
  "programmatic bvod": "programmatic-bvod",
  "programmatic ooh": "programmatic-ooh",
  newspaper: "newspaper",
  television: "television",
  radio: "radio",
  magazines: "magazines",
  cinema: "cinema",
  ooh: "ooh",
}

const CODE_TO_KEY = new Map<string, string>()
for (const [typeKey, code] of Object.entries(MEDIA_TYPE_ID_CODES)) {
  const scheduleKey = TYPE_TO_SCHEDULE[typeKey]
  if (scheduleKey) CODE_TO_KEY.set(String(code).toLowerCase(), scheduleKey)
}
const CODES_BY_LENGTH = [...CODE_TO_KEY.keys()].sort((a, b) => b.length - a.length)

const REPORT_GROUP_KEYS: Record<string, string> = {
  social_meta: "social",
  social_tiktok: "social",
  social_reddit: "social",
  digital_display: "digital-display",
  digital_video: "digital-video",
  digital_audio: "digital-audio",
  bvod: "bvod",
  search: "search",
  programmatic_display: "programmatic-display",
  programmatic_video: "programmatic-video",
  programmatic_ooh: "programmatic-ooh",
  programmatic_audio: "programmatic-audio",
  programmatic_bvod: "programmatic-bvod",
}

export type ChannelExpectedInput = {
  deliverySchedule: unknown
  campaignStartISO?: string | null
  campaignEndISO?: string | null
  asOfISO?: string | null
  /** Assumed-spend lines. Their burst sum replaces their share of the schedule slice. */
  assumedLines?: readonly AssumedExpectedLine[]
}

export type ChannelExpectedSlice = {
  key: string
  label: string
  expected: number
  planned: number
}

export type LineExpectedWeight = {
  id: string
  lineExpected: number
  plannedMedia: number
}

function optsOf(input: ChannelExpectedInput): MonthlyPlanCampaignOpts {
  return {
    campaignStartISO: input.campaignStartISO,
    campaignEndISO: input.campaignEndISO,
    asOfISO: input.asOfISO,
    basis: "media",
  }
}

export function scheduleKeyForLabel(label: string): string {
  const trimmed = label.trim()
  const alias = LABEL_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias
  const typeKey = Object.entries(MEDIA_TYPE_LABELS).find(([, value]) => value === trimmed)?.[0]
  if (typeKey && TYPE_TO_SCHEDULE[typeKey]) return TYPE_TO_SCHEDULE[typeKey]
  if (TYPE_TO_SCHEDULE[trimmed]) return TYPE_TO_SCHEDULE[trimmed]
  return trimmed.toLowerCase().replace(/\s+/g, "-")
}

export function labelForScheduleKey(key: string): string {
  return KEY_LABELS[key] ?? key
}

export function scheduleKeyForLineItemId(lineItemId: string): string | null {
  const id = lineItemId.trim()
  if (!id) return null
  for (const code of CODES_BY_LENGTH) {
    if (new RegExp(`${code}\\d+$`, "i").test(id)) return CODE_TO_KEY.get(code) ?? null
  }
  return null
}

export function scheduleKeyForReportGroup(group: string): string | null {
  return REPORT_GROUP_KEYS[group] ?? null
}

export function scheduleKeyForPortfolioChannel(channelKey: string, label?: string): string | null {
  if (channelKey.startsWith("social-")) return "social"
  if (channelKey === "search" || channelKey.startsWith("search:")) return "search"
  if (
    channelKey === "digital-display" ||
    channelKey === "digital-video" ||
    channelKey === "digital-audio" ||
    channelKey === "bvod"
  ) {
    return channelKey
  }
  for (const prefix of [
    "programmatic-display",
    "programmatic-video",
    "programmatic-audio",
    "programmatic-bvod",
    "programmatic-ooh",
  ]) {
    if (channelKey === prefix || channelKey.startsWith(`${prefix}:`)) return prefix
  }
  const coded = channelKey.match(/^(?:assumed|direct)-(.+)$/)
  if (coded) {
    const code = coded[1].toLowerCase()
    if (CODE_TO_KEY.has(code)) return CODE_TO_KEY.get(code) ?? null
    if (TYPE_TO_SCHEDULE[code]) return TYPE_TO_SCHEDULE[code]
  }
  if (label) {
    const fromLabel = scheduleKeyForLabel(label)
    if (KEY_LABELS[fromLabel]) return fromLabel
  }
  return null
}

export function scheduleKeyForCoverageKey(key: string): string | null {
  if (key.startsWith("social-")) return "social"
  if (key === "search" || key.startsWith("search:")) return "search"
  for (const prefix of [
    "digital-display",
    "digital-video",
    "digital-audio",
    "bvod",
    "programmatic-display",
    "programmatic-video",
    "programmatic-audio",
    "programmatic-bvod",
    "programmatic-ooh",
    "newspaper",
    "television",
    "radio",
    "magazines",
    "cinema",
    "ooh",
  ]) {
    if (key === prefix || key.startsWith(`${prefix}:`)) return prefix
  }
  return null
}

/** Largest-remainder split of integer cents. Weights of 0 share nothing unless every weight is 0. */
export function allocateCents(totalCents: number, weights: readonly number[]): number[] {
  const count = weights.length
  if (count === 0 || !(totalCents > 0)) return weights.map(() => 0)
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  const sum = safe.reduce((total, weight) => total + weight, 0)
  if (sum <= 0) {
    const base = Math.floor(totalCents / count)
    let left = totalCents - base * count
    return safe.map((_, index) => {
      if (left <= 0) return base
      left -= 1
      return base + 1
    })
  }
  const exact = safe.map((weight) => (totalCents * weight) / sum)
  const floors = exact.map((value) => Math.floor(value + 1e-9))
  let left = totalCents - floors.reduce((total, value) => total + value, 0)
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const row of order) {
    if (left <= 0) break
    floors[row.index] += 1
    left -= 1
  }
  return floors
}

export function reconcileLineExpected(
  channelDollars: number,
  lines: readonly LineExpectedWeight[],
  /** Assumed lines keep these dollars. The remainder is split across the other lines. */
  fixed?: ReadonlyMap<string, number>,
): Map<string, number> {
  if (fixed && fixed.size > 0 && lines.some((line) => fixed.has(line.id))) {
    const flex = lines.filter((line) => !fixed.has(line.id))
    const fixedCents = lines.reduce((sum, line) => {
      if (!fixed.has(line.id)) return sum
      return sum + Math.max(0, toCents(fixed.get(line.id) ?? 0))
    }, 0)
    const remain = Math.max(0, toCents(channelDollars) - fixedCents)
    const out = reconcileLineExpected(fromCents(remain), flex)
    for (const line of lines) {
      if (!fixed.has(line.id)) continue
      out.set(line.id, fromCents(Math.max(0, toCents(fixed.get(line.id) ?? 0))))
    }
    return out
  }
  const weightSum = lines.reduce(
    (sum, line) => sum + (line.lineExpected > 0 ? line.lineExpected : 0),
    0,
  )
  const weights =
    weightSum > 0
      ? lines.map((line) => (line.lineExpected > 0 ? line.lineExpected : 0))
      : lines.map((line) => (line.plannedMedia > 0 ? line.plannedMedia : 0))
  const parts = allocateCents(Math.max(0, toCents(channelDollars)), weights)
  const out = new Map<string, number>()
  lines.forEach((line, index) => {
    out.set(line.id, fromCents(parts[index] ?? 0))
  })
  return out
}

type MonthRow = { month: string; data: Array<{ mediaType: string; amount: number }> }

function rowsForLabel(rows: MonthRow[], label: string): MonthRow[] {
  return rows.map((row) => ({
    month: row.month,
    data: row.data.filter((item) => item.mediaType === label),
  }))
}

export function channelExpectedToDate(input: ChannelExpectedInput): ChannelExpectedSlice[] {
  const opts = optsOf(input)
  const rows = monthlySpendArrayFromDeliverySchedule(input.deliverySchedule)
  if (rows.length === 0) return []
  const headline = expectedSpendToDateFromDeliveryScheduleMonthly(input.deliverySchedule, opts)
  const labels = new Set<string>()
  for (const row of rows) {
    for (const item of row.data) {
      if (!item.mediaType || NON_MEDIA.has(item.mediaType.trim().toLowerCase())) continue
      if (!(item.amount > 0)) continue
      labels.add(item.mediaType)
    }
  }

  const merged = new Map<string, ChannelExpectedSlice>()
  for (const label of labels) {
    const filtered = rowsForLabel(rows, label)
    const expected = expectedSpendToDateFromMonthlyCalendar(filtered, opts)
    const planned = totalPlannedSpendFromMonthly(filtered, opts)
    if (!(expected > 0) && !(planned > 0)) continue
    const key = scheduleKeyForLabel(label)
    const existing = merged.get(key)
    if (existing) {
      existing.expected = roundMoney2(existing.expected + expected)
      existing.planned = roundMoney2(existing.planned + planned)
      continue
    }
    merged.set(key, {
      key,
      label: KEY_LABELS[key] ?? label,
      expected,
      planned,
    })
  }

  const slices = [...merged.values()].filter((slice) => slice.expected > 0 || slice.planned > 0)
  const rawCents = slices.reduce((sum, slice) => sum + toCents(slice.expected), 0)
  const headCents = toCents(headline)
  if (headCents > 0 && Math.abs(headCents - rawCents) <= 1) {
    const parts = allocateCents(
      headCents,
      slices.map((slice) => slice.expected),
    )
    slices.forEach((slice, index) => {
      slice.expected = fromCents(parts[index] ?? 0)
    })
  }

  const adjusted = applyAssumedExpected(slices, input.assumedLines, asOfISO(input))
  adjusted.sort((a, b) => b.expected - a.expected || a.key.localeCompare(b.key))
  return adjusted
}

function asOfISO(input: ChannelExpectedInput): string {
  return input.asOfISO?.trim() || getMelbourneTodayISO()
}

/**
 * Assumed planned media at least the slice's planned media: the slice becomes
 * the burst sum. Otherwise the schedule slice keeps the reported share and
 * the burst sum is added.
 */
function applyAssumedExpected(
  slices: ChannelExpectedSlice[],
  lines: readonly AssumedExpectedLine[] | undefined,
  asOf: string,
): ChannelExpectedSlice[] {
  const usable = (lines ?? []).filter((line) => !isAssumedValueAddBuyType(line.buyType))
  if (usable.length === 0) return slices
  const byKey = new Map<string, { plannedCents: number; toDateCents: number }>()
  for (const line of usable) {
    const key = line.scheduleKey
    if (!key) continue
    const bucket = byKey.get(key) ?? { plannedCents: 0, toDateCents: 0 }
    bucket.plannedCents += Math.max(0, toCents(line.plannedMedia))
    bucket.toDateCents += assumedLineToDateCents(line, asOf)
    byKey.set(key, bucket)
  }
  if (byKey.size === 0) return slices

  const out = slices.map((slice) => ({ ...slice }))
  for (const [key, bucket] of byKey) {
    let slice = out.find((row) => row.key === key)
    if (!slice) {
      slice = {
        key,
        label: labelForScheduleKey(key),
        expected: 0,
        planned: fromCents(bucket.plannedCents),
      }
      out.push(slice)
    }
    const plannedCents = toCents(slice.planned)
    if (!(plannedCents > 0) || bucket.plannedCents >= plannedCents) {
      slice.expected = fromCents(bucket.toDateCents)
      continue
    }
    const reportedPlanned = plannedCents - bucket.plannedCents
    const reportedCents = Math.round((toCents(slice.expected) * reportedPlanned) / plannedCents)
    slice.expected = fromCents(reportedCents + bucket.toDateCents)
  }
  return out.filter((slice) => slice.expected > 0 || slice.planned > 0)
}

function dayBeforeISO(iso: string): string {
  const [year, month, day] = iso.split("-").map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/** Campaign-to-date is the as-of slice. A bounded period is end minus the day before the start. */
export function channelExpectedForWindow(
  input: ChannelExpectedInput & {
    windowStartISO: string
    windowEndISO: string
    periodSlice: boolean
  },
): ChannelExpectedSlice[] {
  const end = channelExpectedToDate({ ...input, asOfISO: input.windowEndISO })
  if (!input.periodSlice) return end
  const before = new Map(
    channelExpectedToDate({ ...input, asOfISO: dayBeforeISO(input.windowStartISO) }).map((slice) => [
      slice.key,
      slice.expected,
    ]),
  )
  return end.map((slice) => ({
    ...slice,
    expected: roundMoney2(Math.max(0, slice.expected - (before.get(slice.key) ?? 0))),
  }))
}

export function slicesByKey(slices: readonly ChannelExpectedSlice[]): Map<string, number> {
  return new Map(slices.map((slice) => [slice.key, slice.expected]))
}
