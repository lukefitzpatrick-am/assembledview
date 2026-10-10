import { shellUserIdentity } from "@/components/UserMenu"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

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
  family_name?: string | null
  name?: string | null
  nickname?: string | null
  email?: string | null
} | null | undefined

export type MelbourneDayPart = "morning" | "afternoon" | "evening"

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

/** First word of the sidebar card name. Email-only accounts use that helper's title-cased local part. */
export function greetingFirstName(user: GreetingIdentity): string {
  const display = shellUserIdentity({
    given_name: user?.given_name,
    family_name: user?.family_name,
    name: user?.name,
    email: user?.email,
  }).name
  if (!display || display === "Signed in") return "there"
  return display.trim().split(/\s+/)[0] ?? "there"
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

type EditLedeVersion = {
  id?: number
  version_number: number
  published_at?: string | null
}

/**
 * Ordinal for the edit lede. The version list is empty until the picker opens,
 * so a published cut is the pointer row's `published_at`, or the loaded version
 * when that row is the published cut. No stamp stays unpublished.
 */
export function publishedVersionNumberForEditLede(args: {
  publishedVersionId: number | null
  versions: EditLedeVersion[]
  loadedVersionId: number | null
  loadedVersionNumber: number | null
  loadedPublishedAt: string | null
}): number | null {
  const pointer = args.publishedVersionId
  if (pointer != null) {
    const fromList = args.versions.find((version) => version.id === pointer)
    if (
      fromList &&
      fromList.version_number > 0 &&
      isVersionPublished({ publishedAt: fromList.published_at ?? null })
    ) {
      return fromList.version_number
    }
    if (
      args.loadedVersionId === pointer &&
      args.loadedVersionNumber != null &&
      args.loadedVersionNumber > 0 &&
      isVersionPublished({ publishedAt: args.loadedPublishedAt })
    ) {
      return args.loadedVersionNumber
    }
  }
  if (
    args.loadedVersionNumber != null &&
    args.loadedVersionNumber > 0 &&
    isVersionPublished({ publishedAt: args.loadedPublishedAt })
  ) {
    return args.loadedVersionNumber
  }
  return null
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
