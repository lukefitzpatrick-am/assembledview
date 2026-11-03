/**
 * Editor half of the B19 publisher guard (decision Q4). Create and edit call
 * these with the same save lines they post, so the editors give the server's
 * answer before the round trip. The server check stays the real guard.
 */
import { clientFeatureOn } from "@/lib/features/client"
import {
  formatPublisherGuardMessage,
  publisherGuardGateResult,
  type PublisherGuardFinding,
  type PublisherGuardLine,
} from "@/lib/mediaplan/publisherGuard"
import type { PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"
import { stripEmptyLinesOnPublish, type EmptyLineFields } from "@/lib/mediaplan/stripEmptyLineItems"

/**
 * The server's gate, run in the browser with the editor's publisher list and
 * the switch. The save route strips empty lines on publish before its guard
 * (`stripEmptyLinesOnPublish`), so this does too: an empty line the server
 * drops (a $0 production line with no publisher) never blocks here either
 * (B19 review finding 1).
 */
export function publisherGuardPreflight(
  mode: "draft" | "new_version" | "publish" | null | undefined,
  lineItems: readonly (PublisherGuardLine & EmptyLineFields)[],
  publishers: readonly PublisherIdentityRow[],
  enabled: boolean = clientFeatureOn("publisher_guard"),
): ReturnType<typeof publisherGuardGateResult> {
  if (mode == null) return { reject: false, warnings: [] }
  const checked = stripEmptyLinesOnPublish(mode, [...lineItems]).lineItems
  return publisherGuardGateResult({ mode, enabled, lineItems: checked, publishers })
}

export function publisherGuardBlockedToast(blocked: readonly PublisherGuardFinding[]): {
  title: string
  description: string
} {
  return { title: "Publisher not in Publishers", description: formatPublisherGuardMessage(blocked) }
}

/** One toast for every media line saved with no publisher; null when there are none. */
export function publisherWarningsToast(warnings: readonly PublisherGuardFinding[]): {
  title: string
  description: string
} | null {
  if (warnings.length === 0) return null
  const ids = warnings.map((w) => w.lineItemId).join(", ")
  return {
    title: warnings.length === 1 ? "1 line has no publisher" : `${warnings.length} lines have no publisher`,
    description: `Saved. Pick the publisher so billing and reports can place it: ${ids}`,
  }
}
