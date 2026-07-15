/**
 * Guards container → parent media-line publishes against identity churn.
 *
 * Create/edit can pass `oohMediaLineItems` (etc.) back as `initialLineItems`.
 * Hydration restamps burst `_reactKey`s, which would otherwise look like a
 * content change, republish, and infinite-loop Maximum update depth.
 */

export function fingerprintMediaLineItems(items: unknown): string {
  return JSON.stringify(items, (key, value) =>
    key === "_reactKey" ? undefined : value
  )
}

/**
 * Calls `publish` only when the fingerprint of `items` differs from the last
 * published snapshot (ignoring ephemeral `_reactKey` fields).
 */
export function publishMediaLineItemsIfChanged(
  prevFingerprintRef: { current: string },
  items: unknown[],
  publish: (items: any[]) => void
): void {
  const fp = fingerprintMediaLineItems(items)
  if (fp === prevFingerprintRef.current) return
  prevFingerprintRef.current = fp
  publish(items)
}
