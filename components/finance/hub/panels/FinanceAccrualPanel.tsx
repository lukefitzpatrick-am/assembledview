"use client"

import { AccrualTab } from "@/components/finance/tabs/AccrualTab"

export default function FinanceAccrualPanel() {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Accrual</h2>
      <AccrualTab />
    </div>
  )
}
