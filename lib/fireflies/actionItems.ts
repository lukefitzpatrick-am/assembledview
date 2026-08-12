/**
 * Parse Fireflies action_items text → proposal drafts (no DB writes).
 */
export type TeamMemberMatch = {
  email: string
  name: string
}

export type ParsedActionItem = {
  /** Clean title for the task. */
  title: string
  /** Original quoted line. */
  sourceLine: string
  /** Matched roster email if any. */
  assigneeEmail: string | null
}

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
/** "Name: rest" or "Name — rest" at start of line */
const NAME_PREFIX_RE = /^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s*[:—–-]\s+(.+)$/

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
}

/**
 * Split Fireflies summary.action_items into discrete lines.
 */
export function parseActionItemLines(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  const text = stripHtml(raw)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET_RE, "").trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^(action items?|todos?|next steps?)\s*:?$/i.test(l))
  return lines
}

export function matchAssigneeFromLine(
  line: string,
  roster: TeamMemberMatch[],
  attendeeEmails: string[] = []
): string | null {
  const attendeeSet = new Set(
    attendeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  )
  const preferAttendees = (email: string) =>
    attendeeSet.size === 0 || attendeeSet.has(email.toLowerCase())

  const emailHit = line.match(EMAIL_RE)
  if (emailHit) {
    const email = emailHit[0]!.toLowerCase()
    const onRoster = roster.find((m) => m.email.toLowerCase() === email)
    if (onRoster) return onRoster.email.toLowerCase()
  }

  const lower = line.toLowerCase()
  const nameHits: TeamMemberMatch[] = []
  for (const m of roster) {
    const name = m.name.trim()
    if (name.length < 2) continue
    if (lower.includes(name.toLowerCase()) && preferAttendees(m.email)) {
      nameHits.push(m)
    }
  }
  if (nameHits.length === 1) return nameHits[0]!.email.toLowerCase()

  const prefix = line.match(NAME_PREFIX_RE)
  if (prefix?.[1]) {
    const prefixName = prefix[1].trim().toLowerCase()
    const hits = roster.filter((m) => {
      const full = m.name.trim().toLowerCase()
      const first = full.split(/\s+/)[0] ?? ""
      return (
        (full === prefixName || first === prefixName) &&
        preferAttendees(m.email)
      )
    })
    if (hits.length === 1) return hits[0]!.email.toLowerCase()
  }

  return null
}

export function parseActionItems(
  raw: string | null | undefined,
  roster: TeamMemberMatch[],
  attendeeEmails: string[] = []
): ParsedActionItem[] {
  const lines = parseActionItemLines(raw)
  return lines.map((sourceLine) => {
    const prefix = sourceLine.match(NAME_PREFIX_RE)
    const title = (prefix?.[2] ?? sourceLine).trim()
    return {
      title: title || sourceLine,
      sourceLine,
      assigneeEmail: matchAssigneeFromLine(sourceLine, roster, attendeeEmails),
    }
  })
}

export function buildProposalDescription(args: {
  sourceLine: string
  meetingTitle: string | null
  meetingUrl: string | null
  meetingDate: string | null
}): string {
  const parts = [
    `From meeting: ${args.meetingTitle?.trim() || "(untitled)"}`,
    args.meetingDate ? `Date: ${args.meetingDate}` : null,
    args.meetingUrl ? `Transcript: ${args.meetingUrl}` : null,
    "",
    `> ${args.sourceLine}`,
  ].filter((p) => p != null)
  return parts.join("\n")
}

/** Case-insensitive title match against open tasks for the same MBA. */
export function isPossibleDuplicate(
  proposedTitle: string,
  mbaNumber: string | null | undefined,
  openTasks: Array<{ title: string; mbaNumber: string | null }>
): boolean {
  const title = proposedTitle.trim().toLowerCase()
  if (!title) return false
  const mba = (mbaNumber ?? "").trim().toLowerCase()
  if (!mba) return false
  return openTasks.some(
    (t) =>
      (t.mbaNumber ?? "").trim().toLowerCase() === mba &&
      t.title.trim().toLowerCase() === title
  )
}
