/** Treat a detect-score as unknown — never auto-attach a catalogue publisher. */

export const UNKNOWN_PUBLISHER_CONFIDENCE = 0.5

export function isUnknownPublisherMatch(
  match: { confidence: number } | null | undefined,
): boolean {
  if (match == null) return true
  return match.confidence < UNKNOWN_PUBLISHER_CONFIDENCE
}
