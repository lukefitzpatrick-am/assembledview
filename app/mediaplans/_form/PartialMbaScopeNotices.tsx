"use client"

import { PartialMbaAddedSinceNotice } from "@/components/billing/PartialMbaAddedSinceNotice"
import { PartialMbaBillingGuardNotice } from "@/components/billing/PartialMbaBillingGuardNotice"
import { PartialMbaUnmatchedNotice } from "@/components/billing/PartialMbaUnmatchedNotice"
import {
  describeLegacyPartialAddedSince,
  describeLegacyPartialUnresolved,
  type currentLegacyPartialNotices,
} from "@/lib/mediaplan/reconcileLegacyPartialSelection"
import type { PartialMbaGuardResult } from "@/lib/mediaplan/partialMbaBillingVsDelivery"

type Props = {
  isPartial: boolean
  /** `currentLegacyPartialNotices`: the open result as the current selection leaves it. */
  notices: ReturnType<typeof currentLegacyPartialNotices>
  /** `partialMbaBillingGuardWhenOn`: null with the switch off. */
  guard: PartialMbaGuardResult | null
  mediaLabelByKey: Readonly<Record<string, string>>
}

/**
 * The MBA billing window's scope column notices on a partial MBA (edit; B52):
 * MB-33 unmatched saved lines, lines added since (B21fix R4, with the switch
 * off too) and the B21 billing vs delivery guard. Nothing when none applies:
 * the page passes no slot then, so the window draws no empty box.
 */
export function partialMbaScopeNoticesShown({ isPartial, notices, guard }: Omit<Props, "mediaLabelByKey">): boolean {
  return isPartial && (notices.unresolved.length > 0 || notices.addedSince.length > 0 || guard != null)
}

export function PartialMbaScopeNotices({ isPartial, notices, guard, mediaLabelByKey }: Props) {
  if (!partialMbaScopeNoticesShown({ isPartial, notices, guard })) return null
  return (
    <div className="space-y-2">
      {notices.unresolved.length > 0 ? (
        <PartialMbaUnmatchedNotice message={describeLegacyPartialUnresolved(notices.unresolved, mediaLabelByKey)} />
      ) : null}
      {notices.addedSince.length > 0 ? (
        <PartialMbaAddedSinceNotice message={describeLegacyPartialAddedSince(notices.addedSince, mediaLabelByKey)} />
      ) : null}
      <PartialMbaBillingGuardNotice result={guard} mediaLabelByKey={mediaLabelByKey} />
    </div>
  )
}
