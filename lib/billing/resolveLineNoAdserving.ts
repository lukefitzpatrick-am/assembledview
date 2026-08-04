/**
 * Ad-serving exclusion is a LINE-ITEM property (`no_adserving` / `noadserving` /
 * `noAdserving`). Never treat a burst-json field as a second source of truth —
 * persisted bursts leave `noAdserving` null (BOSS011: all bursts null).
 */
export function resolveLineNoAdserving(
  lineItem: Record<string, unknown> | null | undefined
): boolean {
  if (!lineItem) return false
  return Boolean(
    lineItem.no_adserving ?? lineItem.noadserving ?? lineItem.noAdserving ?? false
  )
}
