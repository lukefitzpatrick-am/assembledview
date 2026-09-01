"use client"

import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { XeroSubNav } from "@/components/finance/sections/xero/XeroSubNav"
import { XeroExceptionsPanel } from "@/components/finance/sections/xero/XeroExceptionsPanel"
import { XeroMatchesPanel } from "@/components/finance/sections/xero/XeroMatchesPanel"
import { FinanceScopeFyNotice } from "@/components/finance/sections/FinanceScopeFyNotice"

export function XeroPageClient({ section }: { section: "exceptions" | "matches" }) {
  return (
    <FinanceSectionsShell title="Xero">
      <div className="space-y-4">
        <XeroSubNav />
        <FinanceScopeFyNotice />
        <p className="text-xs text-muted-foreground">
          {section === "exceptions"
            ? "Exceptions · pending finance_billing_records + xero_sync_exceptions (parity with hub queue)."
            : "Matches · PC6 xero_invoice_matches. Mutations: accept / dispute / write-off. Reassign exists server-side but is not exposed here."}
        </p>
        {section === "exceptions" ? <XeroExceptionsPanel /> : <XeroMatchesPanel />}
      </div>
    </FinanceSectionsShell>
  )
}
