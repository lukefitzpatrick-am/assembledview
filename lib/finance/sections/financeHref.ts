/**
 * Append the currently applied finance scope to an in-section path.
 * Serialisation is `scopeToSearchParams` — do not duplicate keys here.
 */

import type { FinanceScopeValues } from "@/lib/finance/sections/defaultScope"
import { FINANCE_SCOPE_QUERY_KEYS, scopeToSearchParams } from "@/lib/finance/sections/scopeUrl"
import { useFinanceScopeStore } from "@/lib/finance/sections/useFinanceScope"

export function financeHref(path: string, applied?: FinanceScopeValues): string {
  const scope = applied ?? useFinanceScopeStore.getState().applied
  const hashIdx = path.indexOf("#")
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : ""
  const withoutHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path
  const qIdx = withoutHash.indexOf("?")
  const pathname = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash
  const existing = new URLSearchParams(qIdx >= 0 ? withoutHash.slice(qIdx + 1) : "")
  for (const key of FINANCE_SCOPE_QUERY_KEYS) existing.delete(key)
  const scopeParams = scopeToSearchParams(scope)
  for (const [k, v] of scopeParams.entries()) existing.set(k, v)
  const qs = existing.toString()
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`
}
