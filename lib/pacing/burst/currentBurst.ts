import { NormalisedBurst } from "@/lib/pacing/campaigns/types";

/**
 * Returns the index of the burst whose [startDate, endDate] window
 * contains the given as-of date (inclusive on both ends).
 *
 * Returns null if no burst contains the date.
 *
 * Bursts are expected to be sorted by startDate. If two bursts overlap on
 * the boundary date, the first one is returned (deterministic).
 *
 * Dates are compared as YYYY-MM-DD strings — lexicographic ordering matches
 * chronological ordering for that format, so no Date construction is needed.
 */
export function findCurrentBurstIndex(
  bursts: Pick<NormalisedBurst, "startDate" | "endDate">[],
  asOfDate: string,
): number | null {
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i];
    if (b.startDate <= asOfDate && asOfDate <= b.endDate) {
      return i;
    }
  }
  return null;
}

/**
 * Inclusive days between two YYYY-MM-DD dates (end - start + 1).
 * Returns null for invalid inputs.
 */
export function inclusiveDaysBetween(startDate: string, endDate: string): number | null {
  const start = Date.parse(startDate + "T00:00:00Z");
  const end = Date.parse(endDate + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const msPerDay = 86_400_000;
  return Math.round((end - start) / msPerDay) + 1;
}
