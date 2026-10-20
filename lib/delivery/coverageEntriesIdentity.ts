import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"

const FIELD_SEP = "\u001f"
const ENTRY_SEP = "\u001e"

/** Stable identity of coverage rows. Expected figures are included so a date filter that only moves expected still re-renders. */
export function coverageEntriesIdentityKey(entries: ChannelCoverageEntry[]): string {
  return entries
    .map((e) =>
      [
        e.key,
        e.label,
        e.colour,
        e.plannedSpend,
        e.plannedImpressions,
        e.deliveredSpend,
        e.deliveredImpressions,
        e.status,
        e.spendModelled,
        e.startsOn,
        e.deliveryStatus,
        e.impressionsStatus,
        e.deliverableLabel,
        e.expectedToDate,
        e.expectedImpressions,
        e.expectedImpressionsToDate,
      ].join(FIELD_SEP),
    )
    .join(ENTRY_SEP)
}

export function applyCoverageIfChanged(
  prevEntries: ChannelCoverageEntry[],
  nextEntries: ChannelCoverageEntry[],
): { nextPrev: ChannelCoverageEntry[]; commit: boolean } {
  const nextKey = coverageEntriesIdentityKey(nextEntries)
  if (coverageEntriesIdentityKey(prevEntries) === nextKey) {
    return { nextPrev: prevEntries, commit: false }
  }
  return { nextPrev: nextEntries, commit: true }
}
