"use client"

import React, { useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { segmentChipClass } from "@/components/layout/navChip"
import {
  billingMonthChipLabel,
  fyBillingMonthChips,
  pressedBillingMonth,
} from "@/lib/finance/sections/billingPresentation"
import { useFinanceScopeStore } from "@/lib/finance/sections/useFinanceScope"
import { cn } from "@/lib/utils"

export function BillingMonthChipRow({
  months,
  pressed,
  onSelect,
}: {
  months: string[]
  pressed: string | null
  onSelect: (month: string) => void
}) {
  return (
    <div role="group" aria-label="Billing month" className="flex flex-wrap gap-1">
      {months.map((month) => {
        const active = pressed === month
        return (
          <button
            key={month}
            type="button"
            className={cn(segmentChipClass(active), !active && "border border-border bg-card")}
            aria-pressed={active}
            onClick={() => onSelect(month)}
          >
            {billingMonthChipLabel(month)}
          </button>
        )
      })}
    </div>
  )
}

/** FY month chips above the scope filters. A click sets from and to, then applies. */
export function BillingMonthChips() {
  const router = useRouter()
  const pathname = usePathname() ?? "/finance/invoicing"
  const searchParams = useSearchParams()
  const applied = useFinanceScopeStore((s) => s.applied)
  const setDraft = useFinanceScopeStore((s) => s.setDraft)
  const setDraftMonthRange = useFinanceScopeStore((s) => s.setDraftMonthRange)
  const apply = useFinanceScopeStore((s) => s.apply)
  const toSearchParams = useFinanceScopeStore((s) => s.toSearchParams)

  const months = useMemo(() => fyBillingMonthChips(applied.fy), [applied.fy])
  const pressed = pressedBillingMonth(applied.monthRange, applied.fy)

  const onSelect = (month: string) => {
    setDraft({ fy: applied.fy })
    setDraftMonthRange({ from: month, to: month })
    apply()
    const next = new URLSearchParams(toSearchParams().toString())
    const current = new URLSearchParams(searchParams?.toString() ?? "")
    const fmode = current.get("fmode")
    if (fmode === "target" || fmode === "variance") next.set("fmode", fmode)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return <BillingMonthChipRow months={months} pressed={pressed} onSelect={onSelect} />
}
