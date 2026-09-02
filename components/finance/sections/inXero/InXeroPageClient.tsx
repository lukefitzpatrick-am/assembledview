"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
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

function formatPulled(iso: string | null): string {
  if (!iso) return "Never pulled"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Never pulled"
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function InXeroPageClient() {
  const { toast } = useToast()
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [view, setView] = useState<ViewState<DraftMatchReport>>({ status: "loading" })
  const [updating, setUpdating] = useState(false)
  const [pulling, setPulling] = useState(false)
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

  const onPull = async () => {
    setPulling(true)
    try {
      const res = await fetch("/api/finance/sections/pull-xero", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        retry_after_seconds?: number
        ok?: boolean
        stamps?: { stamped?: number; skipped?: number; unchanged?: number; failed?: number }
      }
      if (res.status === 429) {
        const secs = body.retry_after_seconds ?? 60
        toast({
          variant: "destructive",
          title: "Pull already running",
          description: `Try again in ${secs}s.`,
        })
        return
      }
      if (!res.ok) {
        throw new Error(body.error || `Pull failed (${res.status})`)
      }
      const stamped = body.stamps?.stamped ?? 0
      const skipped = body.stamps?.skipped ?? 0
      toast({
        title: "Pulled from Xero",
        description:
          skipped > 0
            ? `${stamped} auto-matched, ${skipped} skipped (already matched manually).`
            : "Drafts refreshed. Matching again.",
      })
      load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Pull failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setPulling(false)
    }
  }

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

  const mutate = async (row: DraftMatchRow, action: "accept" | "assign", invoiceKey: string) => {
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
        title: action === "accept" ? "Xero figure recorded" : "Assigned",
        description:
          action === "accept"
            ? "Match saved. The approved snapshot is unchanged — the delta stays visible."
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
            Match Xero drafts to approved invoices before anyone authorises in Xero. This app
            never writes to Xero.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Last pulled {formatPulled(payload?.lastPulledAt ?? null)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onPull()}
              disabled={pulling}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", pulling && "animate-spin")} />
              Pull from Xero
            </Button>
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
            message="Pull from Xero after finance has finished keying drafts. There are no approved invoices waiting, and no live drafts in the last pull."
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
              onAssign={(row, key) => void mutate(row, "assign", key)}
            />
          </div>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}
