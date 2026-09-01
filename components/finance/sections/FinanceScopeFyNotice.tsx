"use client"

import Link from "next/link"
import { fyDisplayLabel } from "@/lib/finance/months"
import { financeHref } from "@/lib/finance/sections/financeHref"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"

/**
 * Periods has no scope bar but still consumes applied.fy from the store.
 * Read-only disclosure until that page gets its own bar (UX-4).
 * Periods hydrates from the URL on mount so this line matches `?fy=`.
 */
export function FinanceScopeFyNotice() {
  const applied = useFinanceScopeApplied()
  return (
    <p className="text-xs text-muted-foreground">
      Using FY{fyDisplayLabel(applied.fy)}. This page has no scope bar —{" "}
      <Link
        href={financeHref("/finance/invoicing", applied)}
        className="underline underline-offset-2 hover:text-foreground"
      >
        change it on Clients billing
      </Link>
      .
    </p>
  )
}
