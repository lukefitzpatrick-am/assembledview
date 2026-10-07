/**
 * Codex quick-add inline syntax parser.
 *
 * Tokens that match are stripped into structured fields and shown as chips.
 * Tokens that look like syntax but do not match stay in the title — never
 * silently dropped.
 *
 * Calendar phrases (`due …`) are resolved in Australia/Sydney civil time.
 * Estimate tokens (`~2h`, `~45m`) parse via `estimateParse`.
 */

import {
  formatMinutesAsEstimate,
  parseEstimateToMinutes,
} from "./estimateParse.js"

export type QuickAddTeamMember = {
  email: string
  name: string
  /** Omitted means active. Inactive members are never an @ match. */
  active?: boolean
}

export type QuickAddClient = {
  id: number
  label: string
  slug?: string | null
}

export type QuickAddChip = {
  kind:
    | "assignee"
    | "client"
    | "mba"
    | "category"
    | "priority"
    | "due"
    | "estimate"
    | "warning"
  label: string
  ok: boolean
}

export type QuickAddParsed = {
  /** Title after matched tokens are removed (trimmed, collapsed spaces). */
  title: string
  assigneeEmail: string | null
  assigneeName: string | null
  /** True when an @token matched a roster member. */
  assigneeFromToken: boolean
  clientId: number | null
  clientLabel: string | null
  /** MBA from the active filter when the text has no MBA token. */
  mbaNumber: string | null
  /** Category from the active filter when the text has no category token. */
  category: string | null
  priority: "low" | "normal" | "high"
  /** YYYY-MM-DD Sydney civil date, or null. */
  dueDate: string | null
  /** True when a due token matched but is not a real calendar date. */
  dateError: boolean
  estimatedMinutes: number | null
  chips: QuickAddChip[]
}

const SYDNEY_TZ = "Australia/Sydney"

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function sydneyCivilParts(
  instant: Date = new Date()
): { year: number; month: number; day: number; weekday: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value
  }
  const year = Number(map.year)
  const month = Number(map.month)
  const day = Number(map.day)
  const weekdayName = (map.weekday ?? "Sun").toLowerCase()
  const weekday =
    weekdayName.startsWith("sun")
      ? 0
      : weekdayName.startsWith("mon")
        ? 1
        : weekdayName.startsWith("tue")
          ? 2
          : weekdayName.startsWith("wed")
            ? 3
            : weekdayName.startsWith("thu")
              ? 4
              : weekdayName.startsWith("fri")
                ? 5
                : 6
  return {
    year,
    month,
    day,
    weekday,
    ymd: `${year}-${pad2(month)}-${pad2(day)}`,
  }
}

export function addSydneyDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

function nextOrSameWeekday(fromYmd: string, fromDow: number, targetDow: number): string {
  let delta = (targetDow - fromDow + 7) % 7
  return addSydneyDays(fromYmd, delta)
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function matchTeamMember(
  token: string,
  team: QuickAddTeamMember[]
): QuickAddTeamMember | null {
  const raw = token.trim().replace(/^@/, "")
  if (!raw) return null
  const lower = raw.toLowerCase()
  const key = normalizeKey(raw)
  team = team.filter((member) => member.active !== false)

  const byEmail = team.find((m) => m.email.toLowerCase() === lower)
  if (byEmail) return byEmail

  const byLocal = team.find((m) => {
    const local = m.email.split("@")[0]?.toLowerCase() ?? ""
    return local === lower || normalizeKey(local) === key
  })
  if (byLocal) return byLocal

  const byNameExact = team.find((m) => m.name.toLowerCase() === lower)
  if (byNameExact) return byNameExact

  const byNameKey = team.find((m) => normalizeKey(m.name) === key)
  if (byNameKey) return byNameKey

  // Unique prefix / contains on name (only if exactly one hit).
  const contains = team.filter(
    (m) =>
      normalizeKey(m.name).includes(key) ||
      m.name.toLowerCase().includes(lower)
  )
  if (contains.length === 1) return contains[0]!
  return null
}

function matchClient(
  token: string,
  clients: QuickAddClient[]
): QuickAddClient | null {
  const raw = token.trim().replace(/^#/, "")
  if (!raw) return null
  const lower = raw.toLowerCase()
  const key = normalizeKey(raw)

  const bySlug = clients.find(
    (c) => (c.slug ?? "").toLowerCase() === lower || normalizeKey(c.slug ?? "") === key
  )
  if (bySlug) return bySlug

  const byLabelExact = clients.find(
    (c) => c.label.toLowerCase() === lower || normalizeKey(c.label) === key
  )
  if (byLabelExact) return byLabelExact

  const contains = clients.filter(
    (c) =>
      normalizeKey(c.label).includes(key) ||
      c.label.toLowerCase().includes(lower)
  )
  if (contains.length === 1) return contains[0]!
  return null
}

type DueHit =
  | { ok: true; full: string; ymd: string; label: string }
  | { ok: false; full: string }

function realYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** This year's date when it is still ahead, otherwise next year. Null if neither is a real day. */
function upcomingMonthDay(
  month: number,
  day: number,
  sydney: { year: number; ymd: string }
): string | null {
  const thisYear = realYmd(sydney.year, month, day)
  if (thisYear && thisYear >= sydney.ymd) return thisYear
  return realYmd(sydney.year + 1, month, day)
}

function parseDuePhrase(input: string, now: Date): DueHit | null {
  const sydney = sydneyCivilParts(now)

  // due YYYY-MM-DD
  {
    const m = input.match(/\bdue\s+(\d{4}-\d{2}-\d{2})\b/i)
    if (m) {
      const [year, month, day] = m[1]!.split("-").map(Number)
      const ymd = realYmd(year!, month!, day!)
      if (!ymd) return { ok: false, full: m[0] }
      return { ok: true, full: m[0], ymd, label: ymd }
    }
  }

  // due today / tomorrow
  {
    const m = input.match(/\bdue\s+(today|tomorrow)\b/i)
    if (m) {
      const word = m[1]!.toLowerCase()
      const ymd =
        word === "today" ? sydney.ymd : addSydneyDays(sydney.ymd, 1)
      return {
        ok: true,
        full: m[0],
        ymd,
        label: word === "today" ? "today" : "tomorrow",
      }
    }
  }

  // due friday / monday / …
  {
    const m = input.match(
      /\bdue\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
    )
    if (m) {
      const word = m[1]!.toLowerCase()
      const target = WEEKDAYS[word]!
      const ymd = nextOrSameWeekday(sydney.ymd, sydney.weekday, target)
      return { ok: true, full: m[0], ymd, label: word }
    }
  }

  // due 15 Aug / due 15 August
  {
    const m = input.match(
      /\bdue\s+(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
    )
    if (m) {
      const day = Number(m[1])
      const month = MONTHS[m[2]!.toLowerCase()]
      if (month && day >= 1 && day <= 31) {
        const ymd = upcomingMonthDay(month, day, sydney)
        if (!ymd) return { ok: false, full: m[0] }
        return {
          ok: true,
          full: m[0],
          ymd,
          label: `${day} ${m[2]}`,
        }
      }
    }
  }

  // due Aug 15 / due August 15
  {
    const m = input.match(
      /\bdue\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i
    )
    if (m) {
      const month = MONTHS[m[1]!.toLowerCase()]
      const day = Number(m[2])
      if (month && day >= 1 && day <= 31) {
        const ymd = upcomingMonthDay(month, day, sydney)
        if (!ymd) return { ok: false, full: m[0] }
        return {
          ok: true,
          full: m[0],
          ymd,
          label: `${m[1]} ${day}`,
        }
      }
    }
  }

  return null
}

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

export type ParseQuickAddInput = {
  text: string
  team: QuickAddTeamMember[]
  clients: QuickAddClient[]
  /** Default assignee when no @token matches. This is the signed-in user, never another assignee filter. */
  defaultAssigneeEmail?: string | null
  defaultAssigneeName?: string | null
  /** Fallback client when no #token matches (active list filter). */
  fallbackClientId?: number | null
  fallbackClientLabel?: string | null
  /** Fallback MBA when the text has no MBA token (active list filter). */
  fallbackMbaNumber?: string | null
  /** Fallback category when the text has no category token. `none` means no category. */
  fallbackCategory?: string | null
  now?: Date
}

/**
 * Parse quick-add text into title + structured fields + preview chips.
 */
export function parseQuickAdd(input: ParseQuickAddInput): QuickAddParsed {
  let working = input.text
  const chips: QuickAddChip[] = []
  const now = input.now ?? new Date()

  let estimatedMinutes: number | null = null
  const tildeRe = /(?:^|\s)(~[^\s]+)/g
  let tildeMatch: RegExpExecArray | null
  const tildeTokens: string[] = []
  while ((tildeMatch = tildeRe.exec(working)) !== null) {
    tildeTokens.push(tildeMatch[1]!)
  }
  let consumedTilde: string | null = null
  for (const tok of tildeTokens) {
    const minutes = parseEstimateToMinutes(tok)
    if (minutes != null) {
      estimatedMinutes = minutes
      consumedTilde = tok
      working = working.replace(
        new RegExp(`(?:^|\\s)${escapeReg(tok)}(?=\\s|$)`),
        " "
      )
      const human = formatMinutesAsEstimate(minutes) ?? tok
      chips.push({
        kind: "estimate",
        label: `Estimate ${human}`,
        ok: true,
      })
      break
    }
  }
  for (const tok of tildeTokens) {
    if (tok === consumedTilde) continue
    chips.push({
      kind: "warning",
      label: `Kept in title: “${tok}”`,
      ok: false,
    })
  }

  let dueDate: string | null = null
  let dateError = false
  const dueHit = parseDuePhrase(working, now)
  if (dueHit && !dueHit.ok) {
    working = working.replace(dueHit.full, " ")
    dateError = true
    chips.push({
      kind: "warning",
      label: "Unrecognised date",
      ok: false,
    })
  } else if (dueHit) {
    working = working.replace(dueHit.full, " ")
    dueDate = dueHit.ymd
    chips.push({
      kind: "due",
      label: `Due ${dueHit.label} (${dueHit.ymd})`,
      ok: true,
    })
  } else {
    // Lookalike "due …" that we couldn't resolve — leave in title.
    const loose = working.match(/\bdue\s+\S+/i)
    if (loose) {
      chips.push({
        kind: "warning",
        label: `Kept in title: “${loose[0]}” (unrecognised due date)`,
        ok: false,
      })
    }
  }

  let priority: "low" | "normal" | "high" = "normal"
  const priRe = /(?:^|\s)(!(high|low))(?=\s|$)/gi
  let priMatch: RegExpExecArray | null
  const priMatches: { full: string; value: "high" | "low" }[] = []
  while ((priMatch = priRe.exec(working)) !== null) {
    priMatches.push({
      full: priMatch[1]!,
      value: priMatch[2]!.toLowerCase() as "high" | "low",
    })
  }
  if (priMatches.length > 0) {
    const first = priMatches[0]!
    priority = first.value
    working = working.replace(
      new RegExp(`(?:^|\\s)${escapeReg(first.full)}(?=\\s|$)`, "i"),
      " "
    )
    chips.push({
      kind: "priority",
      label: `Priority ${first.value}`,
      ok: true,
    })
    // Extra !high/!low stay in title (never silently drop).
  }

  // Unknown !tokens (e.g. !medium) — leave in title, warn.
  const bangUnknown = working.match(/(?:^|\s)(![a-z0-9_-]+)(?=\s|$)/i)
  if (bangUnknown && !/^!(high|low)$/i.test(bangUnknown[1]!)) {
    chips.push({
      kind: "warning",
      label: `Kept in title: “${bangUnknown[1]}”`,
      ok: false,
    })
  }

  let assigneeEmail: string | null = null
  let assigneeName: string | null = null
  let assigneeFromToken = false

  const atRe = /(?:^|\s)(@[^\s#]+)/g
  let atMatch: RegExpExecArray | null
  const atTokens: string[] = []
  while ((atMatch = atRe.exec(working)) !== null) {
    atTokens.push(atMatch[1]!)
  }
  let consumedAt: string | null = null
  for (const tok of atTokens) {
    const member = matchTeamMember(tok, input.team)
    if (member) {
      assigneeEmail = member.email
      assigneeName = member.name
      assigneeFromToken = true
      consumedAt = tok
      working = working.replace(
        new RegExp(`(?:^|\\s)${escapeReg(tok)}(?=\\s|$)`),
        " "
      )
      chips.push({
        kind: "assignee",
        label: `Assignee ${member.name}`,
        ok: true,
      })
      break
    }
  }
  for (const tok of atTokens) {
    if (tok === consumedAt) continue
    chips.push({
      kind: "warning",
      label: `Kept in title: “${tok}” (no team match)`,
      ok: false,
    })
  }

  if (!assigneeFromToken) {
    const defEmail = input.defaultAssigneeEmail?.trim() || null
    const defName = input.defaultAssigneeName?.trim() || null
    if (defEmail) {
      assigneeEmail = defEmail.toLowerCase()
      assigneeName = defName
      chips.push({
        kind: "assignee",
        label: `Assignee ${defName || defEmail} (me)`,
        ok: true,
      })
    }
  }

  let clientId: number | null = null
  let clientLabel: string | null = null

  const hashRe = /(?:^|\s)(#[^\s@]+)/g
  let hashMatch: RegExpExecArray | null
  const hashTokens: string[] = []
  while ((hashMatch = hashRe.exec(working)) !== null) {
    hashTokens.push(hashMatch[1]!)
  }
  let consumedHash: string | null = null
  for (const tok of hashTokens) {
    const client = matchClient(tok, input.clients)
    if (client) {
      clientId = client.id
      clientLabel = client.label
      consumedHash = tok
      working = working.replace(
        new RegExp(`(?:^|\\s)${escapeReg(tok)}(?=\\s|$)`),
        " "
      )
      chips.push({
        kind: "client",
        label: `Client ${client.label}`,
        ok: true,
      })
      break
    }
  }
  for (const tok of hashTokens) {
    if (tok === consumedHash) continue
    chips.push({
      kind: "warning",
      label: `Kept in title: “${tok}” (no client match)`,
      ok: false,
    })
  }

  if (clientId == null && input.fallbackClientId != null) {
    clientId = input.fallbackClientId
    clientLabel = input.fallbackClientLabel ?? String(input.fallbackClientId)
    chips.push({
      kind: "client",
      label: `Client ${clientLabel} (filter)`,
      ok: true,
    })
  }

  if (clientId == null) {
    chips.push({
      kind: "warning",
      label: "Client required — add #name or pick a client filter",
      ok: false,
    })
  }

  let mbaNumber: string | null = null
  const fallbackMba = input.fallbackMbaNumber?.trim() || null
  if (fallbackMba) {
    mbaNumber = fallbackMba
    chips.push({
      kind: "mba",
      label: `MBA ${fallbackMba} (filter)`,
      ok: true,
    })
  }

  let category: string | null = null
  const fallbackCategory = input.fallbackCategory?.trim() || null
  if (fallbackCategory === "none") {
    chips.push({
      kind: "category",
      label: "Category none (filter)",
      ok: true,
    })
  } else if (fallbackCategory) {
    category = fallbackCategory
    chips.push({
      kind: "category",
      label: `Category ${fallbackCategory} (filter)`,
      ok: true,
    })
  }

  const title = collapseSpaces(working)

  return {
    title,
    assigneeEmail,
    assigneeName,
    assigneeFromToken,
    clientId,
    clientLabel,
    mbaNumber,
    category,
    priority,
    dueDate,
    dateError,
    estimatedMinutes,
    chips,
  }
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Sydney civil date seven days after today. My week has no lower bound. */
export function myWeekDueBefore(now: Date = new Date()): string {
  return addSydneyDays(sydneyCivilParts(now).ymd, 7)
}

/**
 * Kept for the existing quick-add pin. The tasks list uses `myWeekDueBefore`
 * and does not send a due_after.
 */
export function myWeekDueRange(now: Date = new Date()): {
  dueAfter: string
  dueBefore: string
} {
  const { ymd } = sydneyCivilParts(now)
  return {
    dueAfter: ymd,
    dueBefore: myWeekDueBefore(now),
  }
}

export const MY_WEEK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "waiting",
] as const
