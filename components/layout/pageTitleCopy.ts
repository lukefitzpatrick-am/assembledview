const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

export type GreetingIdentity = {
  given_name?: string | null
  name?: string | null
  nickname?: string | null
  email?: string | null
} | null | undefined

export type MelbourneDayPart = "morning" | "afternoon" | "evening"

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] ?? ""
}

/** Hour in Australia/Melbourne. Morning before 12, afternoon before 17, else evening. */
export function melbourneDayPart(now: Date = new Date()): MelbourneDayPart {
  const raw = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value
  const hour = Number(raw)
  const safe = Number.isFinite(hour) ? hour % 24 : 12
  if (safe < 12) return "morning"
  if (safe < 17) return "afternoon"
  return "evening"
}

export function greetingFirstName(user: GreetingIdentity): string {
  const given = user?.given_name?.trim()
  if (given && !given.includes("@")) {
    const word = firstWord(given)
    if (word) return word
  }
  const name = user?.name?.trim()
  if (name && !name.includes("@")) {
    const word = firstWord(name)
    if (word) return word
  }
  const nick = user?.nickname?.trim()
  if (nick && !nick.includes("@")) {
    const word = firstWord(nick)
    if (word) return word
  }
  const local = user?.email?.split("@")[0]?.split(/[._+-]/).filter(Boolean)[0]
  if (local) return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
  return "there"
}

function monthName(yyyyMm: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm.trim())
  if (!match) return null
  const index = Number(match[2]) - 1
  return MONTH_NAMES[index] ?? null
}

/** Selected billing month for the serif accent. A range reads "October to December". */
export function billingMonthAccent(from: string, to: string): string {
  const start = monthName(from)
  const end = monthName(to)
  if (!start) return end ?? ""
  if (!end || start === end) return start
  return `${start} to ${end}`
}

export function editCampaignLede(args: {
  clientName: string
  mba: string
  publishedVersion: number | null
}): string {
  const client = args.clientName.trim() || "Client"
  const mba = args.mba.trim() || "—"
  const tail = "Changes save as an unpublished draft."
  if (args.publishedVersion != null && args.publishedVersion > 0) {
    return `${client}, MBA ${mba}, version ${args.publishedVersion} published. ${tail}`
  }
  return `${client}, MBA ${mba}. Not published yet. ${tail}`
}
