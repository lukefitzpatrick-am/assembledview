"use client"

import { useEffect, useState } from "react"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { XeroSubNav } from "@/components/finance/sections/xero/XeroSubNav"
import { XeroExceptionsPanel } from "@/components/finance/sections/xero/XeroExceptionsPanel"
import { XeroMatchesPanel } from "@/components/finance/sections/xero/XeroMatchesPanel"
import { XeroUnlinkedContacts } from "@/components/finance/sections/xero/XeroUnlinkedContacts"

type Fy26Coverage = { resolved: number; total: number }

export function XeroPageClient({ section }: { section: "exceptions" | "matches" }) {
  const [coverage, setCoverage] = useState<Fy26Coverage | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch("/api/finance/xero-queue")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled || !data || typeof data !== "object") return
        const meta = (data as { meta?: { fy26_client_coverage?: unknown } }).meta
        const raw = meta?.fy26_client_coverage
        if (!raw || typeof raw !== "object") return
        const resolved = Number((raw as { resolved?: unknown }).resolved)
        const total = Number((raw as { total?: unknown }).total)
        if (!Number.isFinite(resolved) || !Number.isFinite(total)) return
        setCoverage({ resolved, total })
      })
      .catch(() => {
        /* header is informational */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <FinanceSectionsShell title="Exceptions">
      <div className="space-y-4">
        <XeroSubNav />
        {coverage ? (
          <p className="text-xs text-muted-foreground">
            <span className="num">{coverage.resolved}</span>
            {" of "}
            <span className="num">{coverage.total}</span>
            {" FY26 invoices resolved to a client"}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {section === "exceptions"
            ? "Billing rows waiting for a client or MBA, and Xero invoices we couldn't match."
            : "Matched invoices. You can accept, dispute, or write one off."}
        </p>
        {section === "exceptions" ? (
          <>
            <XeroUnlinkedContacts />
            <XeroExceptionsPanel />
          </>
        ) : (
          <XeroMatchesPanel />
        )}
      </div>
    </FinanceSectionsShell>
  )
}
