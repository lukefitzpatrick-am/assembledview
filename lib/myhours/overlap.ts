/**
 * Two-tier overlap guard for time-entry proposals (CX2-6 §5).
 * Pure functions — no DB. Never block on same-day presence alone.
 */

export type OverlapEntry = {
  myhoursLogId: string
  memberEmail: string
  entryDate: string
  note: string | null
  durationMinutes: number
  raw?: unknown
}

export type OverlapProposal = {
  memberEmail: string
  entryDate: string
  note: string
  myhoursLogId: string | null
  meetingStartIso: string | null
  durationMinutes: number
}

export type OverlapHit =
  | { blocked: false }
  | { blocked: true; reason: string }

type TimeInterval = { startMs: number; endMs: number }

const NESTED_RAW_KEYS = ["activity", "timeLog", "log", "time"] as const
const SYDNEY_WALL_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

function parseSydneyWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const parts = Object.fromEntries(
    SYDNEY_WALL_CLOCK.formatToParts(new Date(desiredAsUtc))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  )
  const renderedAsUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!
  )
  return desiredAsUtc - (renderedAsUtc - desiredAsUtc)
}

function parseTimestamp(value: unknown, entryDate: string): number | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null

  const offsetless = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(text)
  if (offsetless) {
    return parseSydneyWallClock(
      Number(offsetless[1]),
      Number(offsetless[2]),
      Number(offsetless[3]),
      Number(offsetless[4]),
      Number(offsetless[5]),
      Number(offsetless[6] ?? "0")
    )
  }

  const direct = Date.parse(text)
  if (Number.isFinite(direct)) return direct

  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (!timeOnly) return null

  const hours = timeOnly[1]!.padStart(2, "0")
  const minutes = timeOnly[2]!
  const seconds = timeOnly[3] ?? "00"
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entryDate)
  if (!dateParts) return null
  return parseSydneyWallClock(
    Number(dateParts[1]),
    Number(dateParts[2]),
    Number(dateParts[3]),
    Number(hours),
    Number(minutes),
    Number(seconds)
  )
}

function rawStartEnd(raw: unknown): { start?: unknown; end?: unknown } {
  if (!raw || typeof raw !== "object") return {}
  const row = raw as Record<string, unknown>

  if (row.startTime != null || row.endTime != null) {
    return { start: row.startTime, end: row.endTime }
  }

  for (const key of NESTED_RAW_KEYS) {
    const nested = row[key]
    if (!nested || typeof nested !== "object") continue
    const obj = nested as Record<string, unknown>
    if (obj.startTime != null || obj.endTime != null) {
      return { start: obj.startTime, end: obj.endTime }
    }
  }

  return {}
}

/** Parse start/end from MyHours activity raw when available. */
export function intervalFromRaw(
  raw: unknown,
  entryDate: string,
  durationMinutes: number
): TimeInterval | null {
  const { start, end } = rawStartEnd(raw)
  const startMs = parseTimestamp(start, entryDate)
  if (startMs == null) return null

  let endMs = parseTimestamp(end, entryDate)
  if (endMs == null && durationMinutes > 0) {
    endMs = startMs + durationMinutes * 60 * 1000
  }
  if (endMs == null || endMs <= startMs) return null

  return { startMs, endMs }
}

function intervalFromMeeting(
  meetingStartIso: string | null,
  durationMinutes: number
): TimeInterval | null {
  if (!meetingStartIso?.trim()) return null
  const startMs = Date.parse(meetingStartIso.trim())
  if (!Number.isFinite(startMs)) return null
  if (durationMinutes <= 0) return null

  const endMs = startMs + durationMinutes * 60 * 1000
  if (endMs <= startMs) return null
  return { startMs, endMs }
}

function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

function sameMemberDay(entry: OverlapEntry, proposal: OverlapProposal): boolean {
  return (
    entry.memberEmail === proposal.memberEmail &&
    entry.entryDate === proposal.entryDate
  )
}

export function checkTimeEntryOverlap(
  proposal: OverlapProposal,
  sameDayEntries: OverlapEntry[]
): OverlapHit {
  const proposalNote = proposal.note.trim()

  for (const entry of sameDayEntries) {
    if (!sameMemberDay(entry, proposal)) continue

    const entryNote = entry.note?.trim() ?? ""
    if (entryNote && entryNote === proposalNote) {
      return {
        blocked: true,
        reason: `existing time entry with note "${entryNote}"`,
      }
    }

    if (
      proposal.myhoursLogId != null &&
      proposal.myhoursLogId === entry.myhoursLogId
    ) {
      return {
        blocked: true,
        reason: `time entry already linked (log ${entry.myhoursLogId})`,
      }
    }
  }

  const meetingInterval = intervalFromMeeting(
    proposal.meetingStartIso,
    proposal.durationMinutes
  )
  if (!meetingInterval) return { blocked: false }

  for (const entry of sameDayEntries) {
    if (!sameMemberDay(entry, proposal)) continue

    const entryInterval = intervalFromRaw(
      entry.raw,
      entry.entryDate,
      entry.durationMinutes
    )
    if (!entryInterval) continue

    if (intervalsOverlap(meetingInterval, entryInterval)) {
      const label = entry.note?.trim() || `log ${entry.myhoursLogId}`
      return {
        blocked: true,
        reason: `overlaps time entry: ${label}`,
      }
    }
  }

  return { blocked: false }
}
