/**
 * B19 publisher guard (decision Q4). Pure: no DB, no server-only, so the
 * save route and both editors run the same check.
 *
 * On publish, with the `publisher_guard` switch on:
 * - Blocked: a line whose publisher is a typed name that isn't in Publishers
 *   (any channel, production included).
 * - Blocked: a production line with no publisher (who bills it is unknown).
 * - Warned: a media line with no publisher. The save still commits.
 *
 * "In Publishers" means the shared resolver finds it
 * (`lib/publisher/resolvePublisherName.ts`): the trimmed, case-insensitive
 * name, a read-time alias Luke approved, or a publisherid no other
 * publisher shares. The guard reads only the channel's picker field
 * (`PUBLISHER_FIELD_BY_CHANNEL`). What it guarantees: on publish, that field
 * names a publisher the resolver places, the one AA routing and the finance
 * codes read. It doesn't promise every reader places the line: for
 * newspaper and magazines the investment cut SQL (`PUBLISHER_IDENTITY_SQL`)
 * and `resolveLineDimensions` read the free-text `publisher` (often the
 * masthead) before `attrs.network`, and the guard doesn't check that field.
 *
 * Draft and new_version saves are never checked: a planner can save mid-edit.
 */

import type { LineChannel } from "@/db/schema/lineChannelValues"
import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"
import { PRODUCTION_LINE_CHANNEL } from "@/lib/mediaplan/missingBuyTypeGate"
import {
  publisherIdentityKey,
  type PublisherIdentityRow,
} from "@/lib/publisher/publisherUniqueness"
import { createPublisherNameResolver } from "@/lib/publisher/resolvePublisherName"

export const PUBLISHER_NOT_IN_PUBLISHERS = "PUBLISHER_NOT_IN_PUBLISHERS" as const

export type PublisherGuardField = "publisher" | "platform" | "network"

/**
 * The line field each channel's publisher picker writes: the expert grid
 * `combobox-publishers` column (`lib/mediaplan/expertGridChannelConfig.ts`),
 * which the standard cards share. `network` lives in `attrs`.
 */
export const PUBLISHER_FIELD_BY_CHANNEL: Readonly<Record<LineChannel, PublisherGuardField>> =
  Object.freeze({
    television: "network",
    radio: "network",
    cinema: "network",
    newspaper: "network",
    magazines: "network",
    ooh: "network",
    prog_display: "platform",
    prog_video: "platform",
    prog_audio: "platform",
    prog_bvod: "platform",
    prog_ooh: "platform",
    digi_display: "publisher",
    digi_video: "publisher",
    digi_audio: "publisher",
    digi_bvod: "publisher",
    social: "platform",
    search: "platform",
    influencers: "platform",
    integrations: "platform",
    production: "publisher",
  })

/** Digital cards read `publisher`, then the older `platform` (the card's own fallback). */
const LEGACY_PLATFORM_FALLBACK = new Set<string>(["digi_display", "digi_video", "digi_audio", "digi_bvod"])

/** The publisher channel flag a new publisher needs to show in that channel's picker. */
export const PUBLISHER_FLAG_BY_CHANNEL: Readonly<Record<LineChannel, string | null>> = Object.freeze({
  television: "pub_television",
  radio: "pub_radio",
  cinema: "pub_cinema",
  newspaper: "pub_newspaper",
  magazines: "pub_magazines",
  ooh: "pub_ooh",
  prog_display: "pub_progdisplay",
  prog_video: "pub_progvideo",
  prog_audio: "pub_progaudio",
  prog_bvod: "pub_progbvod",
  prog_ooh: "pub_progooh",
  digi_display: "pub_digidisplay",
  digi_video: "pub_digivideo",
  digi_audio: "pub_digiaudio",
  digi_bvod: "pub_bvod",
  social: "pub_socialmedia",
  search: "pub_search",
  influencers: "pub_influencers",
  integrations: "pub_integration",
  // Production has no flag: its picker lists every publisher.
  production: null,
})

const CHANNEL_LABEL: Readonly<Record<LineChannel, string>> = Object.freeze({
  television: "Television",
  radio: "Radio",
  cinema: "Cinema",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  prog_display: "Programmatic Display",
  prog_video: "Programmatic Video",
  prog_audio: "Programmatic Audio",
  prog_bvod: "Programmatic BVOD",
  prog_ooh: "Programmatic OOH",
  digi_display: "Digital Display",
  digi_video: "Digital Video",
  digi_audio: "Digital Audio",
  digi_bvod: "BVOD",
  social: "Social",
  search: "Search",
  influencers: "Influencers",
  integrations: "Integration",
  production: "Production",
})

export type PublisherGuardLine = {
  lineItemId: string
  channel: string
  publisher?: string | null
  platform?: string | null
  attrs?: Record<string, unknown> | null
}

export type PublisherGuardKind = "unknown" | "production_blank" | "media_blank"

export type PublisherGuardFinding = {
  lineItemId: string
  channel: string
  field: PublisherGuardField
  kind: PublisherGuardKind
  /** The trimmed value on the line ("" when blank). */
  value: string
  message: string
}

export type PublisherGuardResult = {
  blocked: PublisherGuardFinding[]
  warnings: PublisherGuardFinding[]
}

function isLineChannel(channel: string): channel is LineChannel {
  return Object.prototype.hasOwnProperty.call(PUBLISHER_FIELD_BY_CHANNEL, channel)
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** The publisher value a line carries for its channel, trimmed. */
export function linePublisherValue(line: PublisherGuardLine): string {
  if (!isLineChannel(line.channel)) return ""
  const field = PUBLISHER_FIELD_BY_CHANNEL[line.channel]
  if (field === "network") return text(line.attrs?.network)
  if (field === "platform") return text(line.platform)
  const own = text(line.publisher)
  if (own || !LEGACY_PLATFORM_FALLBACK.has(line.channel)) return own
  return text(line.platform)
}

function channelLabel(channel: string): string {
  return isLineChannel(channel) ? CHANNEL_LABEL[channel] : channel
}

function findingMessage(kind: PublisherGuardKind, channel: string, lineItemId: string, value: string): string {
  if (kind === "unknown") {
    return `"${value}" isn't in Publishers (${channelLabel(channel)} line ${lineItemId}). Pick a publisher from the list, or add it to Publishers.`
  }
  if (kind === "production_blank") {
    return `Production line ${lineItemId} has no publisher. Pick who bills it.`
  }
  return `${channelLabel(channel)} line ${lineItemId} has no publisher. It still saves.`
}

/**
 * Checks every line. An empty publisher list returns nothing: the list
 * failed to load, so "unknown" can't be told apart (the server re-checks).
 */
export function evaluatePublisherGuard(
  lines: readonly PublisherGuardLine[],
  publishers: readonly PublisherIdentityRow[],
): PublisherGuardResult {
  const result: PublisherGuardResult = { blocked: [], warnings: [] }
  if (publishers.length === 0) return result
  const resolve = createPublisherNameResolver(publishers)
  for (const line of lines) {
    if (!isLineChannel(line.channel)) continue
    const field = PUBLISHER_FIELD_BY_CHANNEL[line.channel]
    const value = linePublisherValue(line)
    let kind: PublisherGuardKind | null = null
    if (!value) {
      kind = line.channel === PRODUCTION_LINE_CHANNEL ? "production_blank" : "media_blank"
    } else if (!resolve(value)) {
      kind = "unknown"
    }
    if (!kind) continue
    const finding: PublisherGuardFinding = {
      lineItemId: line.lineItemId,
      channel: line.channel,
      field,
      kind,
      value,
      message: findingMessage(kind, line.channel, line.lineItemId, value),
    }
    if (kind === "media_blank") result.warnings.push(finding)
    else result.blocked.push(finding)
  }
  return result
}

/** Publish only, and only with the switch on. */
export function shouldRunPublisherGuard(
  mode: "draft" | "new_version" | "publish",
  enabled: boolean,
): boolean {
  return enabled && mode === "publish"
}

export function formatPublisherGuardMessage(blocked: readonly PublisherGuardFinding[]): string {
  const unknown = blocked.filter((f) => f.kind === "unknown")
  const blankProduction = blocked.filter((f) => f.kind === "production_blank")
  const parts: string[] = []
  if (unknown.length > 0) {
    parts.push(
      `not in Publishers: ${unknown.map((f) => `"${f.value}" (${f.lineItemId})`).join(", ")}`,
    )
  }
  if (blankProduction.length > 0) {
    parts.push(`production lines with no publisher: ${blankProduction.map((f) => f.lineItemId).join(", ")}`)
  }
  if (parts.length === 0) return "Pick a publisher from Publishers to publish"
  return `Pick a publisher from Publishers to publish. ${parts.join("; ")}`
}

export type PublisherGuardRejectBody = {
  error: string
  code: typeof PUBLISHER_NOT_IN_PUBLISHERS
  lineItemIds: string[]
  publisherIssues: PublisherGuardFinding[]
}

export function publisherGuardGateResult(args: {
  mode: "draft" | "new_version" | "publish"
  enabled: boolean
  lineItems: readonly PublisherGuardLine[]
  publishers: readonly PublisherIdentityRow[]
}):
  | { reject: false; warnings: PublisherGuardFinding[] }
  | { reject: true; body: PublisherGuardRejectBody } {
  if (!shouldRunPublisherGuard(args.mode, args.enabled)) return { reject: false, warnings: [] }
  const { blocked, warnings } = evaluatePublisherGuard(args.lineItems, args.publishers)
  if (blocked.length === 0) return { reject: false, warnings }
  return {
    reject: true,
    body: {
      error: formatPublisherGuardMessage(blocked),
      code: PUBLISHER_NOT_IN_PUBLISHERS,
      lineItemIds: [...new Set(blocked.map((f) => f.lineItemId))],
      publisherIssues: blocked,
    },
  }
}

export function publisherGuardBuilderIssues(
  blocked: readonly PublisherGuardFinding[],
  warnings: readonly PublisherGuardFinding[],
): BuilderIssue[] {
  const issue = (f: PublisherGuardFinding, severity: "error" | "warning"): BuilderIssue => ({
    id: `publisher-guard:${f.kind}:${f.lineItemId}`,
    severity,
    title: f.message,
    detail:
      f.kind === "unknown"
        ? "Publish is blocked until the line names a publisher in Publishers."
        : f.kind === "production_blank"
          ? "Publish is blocked until the production line names a publisher."
          : "Does not block publish. Pick the publisher so billing and reports can place it.",
    stepLabel: "Media",
    fieldLabel: f.field === "network" ? "Network" : f.field === "platform" ? "Platform" : "Publisher",
  })
  return [...blocked.map((f) => issue(f, "error")), ...warnings.map((f) => issue(f, "warning"))]
}

export type MissingPublisherShortcut = {
  /** The typed name, first spelling seen. */
  name: string
  /** Publisher channel flags to tick on the new publisher. */
  flags: string[]
}

/** One "Add to Publishers" entry per distinct typed name (case and spaces ignored). */
export function missingPublisherShortcuts(
  blocked: readonly PublisherGuardFinding[],
): MissingPublisherShortcut[] {
  const byKey = new Map<string, MissingPublisherShortcut>()
  for (const f of blocked) {
    if (f.kind !== "unknown") continue
    const key = publisherIdentityKey(f.value)
    if (!key) continue
    const entry = byKey.get(key) ?? { name: f.value, flags: [] }
    const flag = isLineChannel(f.channel) ? PUBLISHER_FLAG_BY_CHANNEL[f.channel] : null
    if (flag && !entry.flags.includes(flag)) entry.flags.push(flag)
    byKey.set(key, entry)
  }
  return [...byKey.values()]
}

/** Drops the unknown-name findings a newly added publisher now resolves. */
export function clearResolvedPublisherFindings(
  blocked: readonly PublisherGuardFinding[],
  publishers: readonly PublisherIdentityRow[],
): PublisherGuardFinding[] {
  if (publishers.length === 0) return [...blocked]
  const resolve = createPublisherNameResolver(publishers)
  return blocked.filter((f) => f.kind !== "unknown" || !resolve(f.value))
}
