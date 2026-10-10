"use client"

import { useCallback, useEffect, useState } from "react"
import { Download } from "lucide-react"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { InXeroOutcomeList } from "@/components/finance/sections/inXero/InXeroOutcomeSection"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import {
  type DraftMatchReport,
  type DraftMatchRow,
} from "@/lib/finance/sections/draftMatch"
import { exportDraftMatchExcel } from "@/lib/finance/sections/exportDraftMatch"
import {
  useFinanceScopeApplied,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import type { ViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

function formatMelbourneStamp(iso: string | null, empty: string): string {
  if (!iso) return empty
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return empty
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  const dayPeriod = pick("dayPeriod").toLowerCase()
  return `${pick("day")} ${pick("month")}, ${pick("hour")}:${pick("minute")} ${dayPeriod}`
}

export function InXeroPageClient() {
  const { toast } = useToast()
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [view, setView] = useState<ViewState<DraftMatchReport>>({ status: "loading" })
  const [updating, setUpdating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [assignClient, setAssignClient] = useState<Record<string, string>>({})
  const [assignMba, setAssignMba] = useState<Record<string, string>>({})
  const [assignKey, setAssignKey] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setView((prev) => {
      if (prev.status === "ready") return prev
      return { status: "loading" }
    })
    setUpdating(true)
    const params: Record<string, string | number | undefined | null> = {}
    if (applied.clients.length > 0) params.clients = applied.clients.join(",")
    void fetchFinanceSectionsJson<DraftMatchReport>(
      "/api/finance/sections/draft-match",
      params,
      { retry: () => load() }
    ).then((next) => {
      setUpdating(false)
      setView(next)
    })
  }, [applied.clients])

  useEffect(() => {
    load()
  }, [load, scopeVersion])

  const payload = view.status === "ready" ? view.data : null
  const exceptionCount = payload
    ? payload.counts.Differs + payload.counts.Missing + payload.counts.Extra
    : 0

  const onExport = async () => {
    if (!payload) return
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await exportDraftMatchExcel(payload, `xero-draft-match-${stamp}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const mutate = async (
    row: DraftMatchRow,
    action: "accept" | "dispute" | "assign",
    invoiceKey: string,
  ) => {
    const xeroId = row.drafts[0]?.xero_invoice_id
    if (!xeroId || !invoiceKey) return
    setBusyId(row.id)
    try {
      const res = await fetch("/api/finance/sections/draft-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          invoice_key: invoiceKey,
          xero_invoice_id: xeroId,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(err.message || err.error || `Request failed (${res.status})`)
      }
      toast({
        title: action === "accept" ? "Xero figure adopted" : action === "dispute" ? "Disputed" : "Assigned",
        description:
          action === "accept"
            ? "Approved snapshot amount now matches the Xero subtotal."
            : action === "dispute"
              ? "Difference marked disputed."
              : "Manual match saved.",
      })
      load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Match failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusyId(null)
    }
  }

  const showingLabel = payload
    ? `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} · ${payload.counts.Agrees} agree`
    : "Xero drafts vs approved invoices"

  const dimmed = updating && view.status === "ready"

  return (
    <FinanceSectionsShell
      title="In Xero"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Match runs each night after the Xero invoice ingest. This app never writes to Xero.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Xero synced {formatMelbourneStamp(payload?.lastNightlySyncAt ?? null, "never")} · Last manual pull {formatMelbourneStamp(payload?.lastPulledAt ?? null, "none")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onExport()}
              disabled={!payload || exporting}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
          </div>
        </div>

        {view.status === "loading" && !payload ? <LoadingState rows={8} /> : null}
        {view.status === "error" ? (
          <ErrorState message={view.message} onRetry={view.retry} />
        ) : null}
        {view.status === "ready" && payload && exceptionCount === 0 && payload.counts.Agrees === 0 ? (
          <EmptyState
            title="No drafts to match"
            message="Nothing is waiting. The nightly sync matches Xero invoices to app records."
          />
        ) : null}

        {payload ? (
          <div className={cn(dimmed && "opacity-70")}>
            <InXeroOutcomeList
              grouped={payload.grouped}
              candidates={payload.approvedCandidates}
              mbaOptions={payload.mbaOptions}
              busyId={busyId}
              assign={{
                assignClient,
                assignMba,
                assignKey,
                setAssignClient,
                setAssignMba,
                setAssignKey,
              }}
              onAccept={(row) => void mutate(row, "accept", row.approved[0]?.invoice_key ?? "")}
              onDispute={(row) => void mutate(row, "dispute", row.approved[0]?.invoice_key ?? "")}
              onAssign={(row, key) => void mutate(row, "assign", key)}
            />
          </div>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}
