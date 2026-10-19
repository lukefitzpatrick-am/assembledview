/**
 * Relabels v2 matching rules. Pure and client-reachable: no db or Snowflake.
 *
 * Statuses: matched, not_on_plan, no_plan_id, duplicate, check_dates.
 * Suggestions:
 *   high      one obvious target: a legacy ML code (pre-May 2026, see
 *             lib/mediaplan/lineItemIds.ts) or an id with the media code
 *             missing (hartm0011), where exactly one plan line has the same
 *             MBA, number and channel family; or a name that carries a
 *             published line id when the line id does not.
 *   check     same MBA, number and channel family, different code, and the
 *             target line has no delivery yet; or the high cases with more
 *             than one possible target (the user picks, we never do).
 *   duplicate same channel family, first date, last date and spend (to the
 *             cent) as an entity already on a line. Never relabel these.
 */
import { cardChannelFromPlanLine, cardChannelFromWarehouse } from "../shared/channels"
import type {
  MatchEntity,
  MatchEntityStatus,
  MatchPlanLine,
  MatchSuggestion,
  MatchSummary,
} from "./types"

/** Media codes, longest first so PROD wins over PD. Includes legacy ML. */
const CODES = "prod|pb|pa|pd|po|pv|ml|tv|np|sm|ra|mg|cn|dd|da|dv|bv|it|se|oh|in"
const LINE_ID_RE = new RegExp(`^([a-z]{3,6}\\d{3})(${CODES})(\\d+)$`, "i")
const NO_CODE_RE = /^([a-z]{3,6}\d{3})(\d{1,3})$/i
const NAME_TOKEN_RE = new RegExp(`([a-z]{3,6}\\d{3})(${CODES})(\\d+)`, "i")
const DATE_SLACK_DAYS = 7

export type ParsedLineId = { mba: string; code: string | null; num: number }

/** `hartm001pd1` → { mba: "hartm001", code: "pd", num: 1 }; `hartm0011` → code null. */
export function parseMatchLineId(raw: string | null | undefined): ParsedLineId | null {
  const id = String(raw ?? "").trim().toLowerCase()
  if (!id) return null
  const coded = id.match(LINE_ID_RE)
  if (coded) return { mba: coded[1]!, code: coded[2]!.toLowerCase(), num: Number(coded[3]) }
  const bare = id.match(NO_CODE_RE)
  if (bare) return { mba: bare[1]!, code: null, num: Number(bare[2]) }
  return null
}

/** The first plan-style token in a free-text name, lower case. */
export function lineIdInName(name: string | null | undefined): string | null {
  const m = String(name ?? "").toLowerCase().match(NAME_TOKEN_RE)
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

export type ChannelFamily = {
  card: ReturnType<typeof cardChannelFromWarehouse>
  sub: "video" | "display" | "ooh" | "audio" | null
}

function subFrom(text: string): ChannelFamily["sub"] {
  const t = text.toLowerCase()
  if (/video|bvod|ctv/.test(t)) return "video"
  if (/ooh/.test(t)) return "ooh"
  if (/audio/.test(t)) return "audio"
  if (/display/.test(t)) return "display"
  return null
}

export function warehouseFamily(channel: string): ChannelFamily {
  return { card: cardChannelFromWarehouse(channel), sub: subFrom(channel) }
}

export function planFamily(lineChannel: string): ChannelFamily {
  return { card: cardChannelFromPlanLine(lineChannel), sub: subFrom(lineChannel) }
}

export function familiesCompatible(a: ChannelFamily, b: ChannelFamily): boolean {
  if (a.card !== b.card) return false
  return a.sub == null || b.sub == null || a.sub === b.sub
}

function dayNumber(ymd: string | null | undefined): number | null {
  const m = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
}

/** Delivery more than 7 days before the line starts or after it ends. */
export function outsideLineDates(
  entity: Pick<MatchEntity, "firstDate" | "lastDate">,
  line: Pick<MatchPlanLine, "startDate" | "endDate">,
): boolean {
  const first = dayNumber(entity.firstDate)
  const last = dayNumber(entity.lastDate)
  const start = dayNumber(line.startDate)
  const end = dayNumber(line.endDate)
  if (first != null && start != null && first < start - DATE_SLACK_DAYS) return true
  if (last != null && end != null && last > end + DATE_SLACK_DAYS) return true
  return false
}

export type RawMatchEntity = Omit<MatchEntity, "key" | "mbaNumber" | "status" | "duplicateOf">

export function entityKey(channel: string, platformEntityId: string): string {
  return `${channel}|${platformEntityId}`
}

function entityMba(raw: RawMatchEntity): string | null {
  return parseMatchLineId(raw.lineItemId)?.mba ?? parseMatchLineId(lineIdInName(raw.name))?.mba ?? null
}

function sameSpend(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

/**
 * Status per entity, plus delivered spend per plan line (entities on the line,
 * check_dates included). `clientMbas` are lower case.
 */
export function classifyMatch(
  rawEntities: RawMatchEntity[],
  rawLines: Omit<MatchPlanLine, "delivered" | "entityCount">[],
  clientMbas: string[],
): { entities: MatchEntity[]; lines: MatchPlanLine[] } {
  const mbas = new Set(clientMbas.map((m) => m.toLowerCase()))
  const lineById = new Map(rawLines.map((line) => [line.lineItemId.toLowerCase(), line]))

  const entities: MatchEntity[] = rawEntities.map((raw) => {
    const lineItemId = raw.lineItemId.toLowerCase()
    const line = lineById.get(lineItemId)
    const mbaNumber = entityMba(raw)
    let status: MatchEntityStatus
    if (line) status = outsideLineDates(raw, line) ? "check_dates" : "matched"
    else if (mbaNumber && mbas.has(mbaNumber)) status = "not_on_plan"
    else status = "no_plan_id"
    return {
      ...raw,
      lineItemId,
      key: entityKey(raw.channel, raw.platformEntityId),
      mbaNumber,
      status,
      duplicateOf: null,
    }
  })

  const onLine = entities.filter((e) => e.status === "matched" || e.status === "check_dates")
  for (const entity of entities) {
    if (entity.status !== "not_on_plan" && entity.status !== "no_plan_id") continue
    if (!(entity.spend > 0)) continue
    const family = warehouseFamily(entity.channel)
    const twin = onLine.find(
      (other) =>
        familiesCompatible(family, warehouseFamily(other.channel)) &&
        other.firstDate === entity.firstDate &&
        other.lastDate === entity.lastDate &&
        sameSpend(other.spend, entity.spend),
    )
    if (twin) {
      entity.status = "duplicate"
      entity.duplicateOf = twin.key
    }
  }

  const delivered = new Map<string, { spend: number; count: number }>()
  for (const entity of onLine) {
    const row = delivered.get(entity.lineItemId) ?? { spend: 0, count: 0 }
    row.spend += entity.spend
    row.count += 1
    delivered.set(entity.lineItemId, row)
  }
  const lines: MatchPlanLine[] = rawLines.map((line) => {
    const id = line.lineItemId.toLowerCase()
    const row = delivered.get(id)
    return { ...line, lineItemId: id, delivered: row?.spend ?? 0, entityCount: row?.count ?? 0 }
  })

  return { entities, lines }
}

function candidatesFor(entity: MatchEntity, parsed: ParsedLineId, lines: MatchPlanLine[]): MatchPlanLine[] {
  const family = warehouseFamily(entity.channel)
  return lines.filter((line) => {
    if (line.lineItemId === entity.lineItemId) return false
    const target = parseMatchLineId(line.lineItemId)
    if (!target || target.mba !== parsed.mba || target.num !== parsed.num) return false
    return familiesCompatible(family, planFamily(line.lineChannel))
  })
}

type Draft = { kind: MatchSuggestion["kind"]; targets: string[]; reason: string; entity: MatchEntity }

function draftFor(entity: MatchEntity, lines: MatchPlanLine[], lineIds: Set<string>): Draft | null {
  if (entity.status === "duplicate") {
    return {
      kind: "duplicate",
      targets: [],
      reason: `Same dates and spend, to the cent, as ${entity.duplicateOf?.split("|")[1] ?? "an entity"} that is already on a line. Relabelling it would double count. Leave it.`,
      entity,
    }
  }

  if (entity.status === "no_plan_id") {
    const fromName = lineIdInName(entity.name)
    if (fromName && lineIds.has(fromName)) {
      return {
        kind: "high",
        targets: [fromName],
        reason: `The name carries ${fromName}, a published line, but the warehouse line id does not.`,
        entity,
      }
    }
    return null
  }

  if (entity.status !== "not_on_plan") return null
  const parsed = parseMatchLineId(entity.lineItemId)
  if (!parsed) return null
  const candidates = candidatesFor(entity, parsed, lines)
  if (candidates.length === 0) return null

  if (parsed.code === "ml" || parsed.code == null) {
    const why =
      parsed.code === "ml"
        ? `${entity.lineItemId} uses the legacy ML code (before May 2026). The plan now uses specific codes`
        : `${entity.lineItemId} is missing its media code`
    if (candidates.length === 1) {
      return {
        kind: "high",
        targets: [candidates[0]!.lineItemId],
        reason: `${why}; the only line with the same MBA, number and channel is ${candidates[0]!.lineItemId}.`,
        entity,
      }
    }
    return {
      kind: "check",
      targets: candidates.map((line) => line.lineItemId),
      reason: `${why}; ${candidates.length} lines fit. Pick the right one.`,
      entity,
    }
  }

  const empty = candidates.filter((line) => line.delivered === 0)
  if (empty.length === 0) return null
  return {
    kind: "check",
    targets: empty.map((line) => line.lineItemId),
    reason: `${entity.lineItemId} is not on the plan. ${empty.map((line) => line.lineItemId).join(" or ")} has the same MBA, number and channel and no delivery yet. Confirm before moving.`,
    entity,
  }
}

const KIND_ORDER: Record<MatchSuggestion["kind"], number> = { high: 0, check: 1, duplicate: 2 }

/** Suggestions grouped by kind and targets, ordered high, check, duplicate, then by spend. */
export function buildMatchSuggestions(entities: MatchEntity[], lines: MatchPlanLine[]): MatchSuggestion[] {
  const lineIds = new Set(lines.map((line) => line.lineItemId))
  const groups = new Map<string, MatchSuggestion>()
  for (const entity of entities) {
    const draft = draftFor(entity, lines, lineIds)
    if (!draft) continue
    const groupKey =
      draft.kind === "duplicate"
        ? `duplicate|${entity.mbaNumber ?? ""}|${entity.channel}`
        : `${draft.kind}|${entity.lineItemId}|${draft.targets.join(",")}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.entityKeys.push(entity.key)
      existing.spend += entity.spend
      continue
    }
    groups.set(groupKey, {
      id: groupKey,
      kind: draft.kind,
      entityKeys: [entity.key],
      targetLineIds: draft.targets,
      reason: draft.reason,
      spend: entity.spend,
    })
  }
  return [...groups.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.spend - a.spend || a.id.localeCompare(b.id),
  )
}

export function summariseMatch(
  entities: MatchEntity[],
  lines: MatchPlanLine[],
  suggestions: MatchSuggestion[],
): MatchSummary {
  const unmatched = entities.filter((e) => e.status === "not_on_plan" || e.status === "no_plan_id")
  return {
    unmatchedSpend: unmatched.reduce((sum, e) => sum + e.spend, 0),
    unmatchedCount: unmatched.length,
    linesWithoutDelivery: lines.filter((line) => line.entityCount === 0).length,
    suggestionCount: suggestions.filter((s) => s.kind !== "duplicate").length,
    checkDatesCount: entities.filter((e) => e.status === "check_dates").length,
  }
}
