/**
 * Build the collapsed-index set used when hydrating expert cards so the first
 * paint is header-only (display). Form values stay in RHF via form.reset /
 * getValues — collapse must not affect save, totals, or billing.
 */
export function allCollapsedIndices(count: number): Set<number> {
  const next = new Set<number>()
  const n = Math.max(0, Math.floor(count))
  for (let i = 0; i < n; i++) next.add(i)
  return next
}
