"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { formatAUD } from "@/lib/format/money"
import type { XeroMatchRow, XeroMonthMetric } from "@/lib/xero/matchListTypes"
import { XeroMonthHealthStrip } from "@/components/finance/sections/xero/XeroMonthHealthStrip"
import {
  invoicingHrefForClientMonth,
  mbaHref,
} from "@/components/finance/sections/xero/xeroLinks"

type ConfirmKind = "accept" | "dispute" | "write_off"

const STATUS_VARIANT: Record<
  XeroMatchRow["status"],
  "good" | "attention" | "blocking" | "secondary"
> = {
  matched: "good",
  diverged: "attention",
  disputed: "blocking",
  written_off: "secondary",
}

export function XeroMatchesPanel() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<XeroMatchRow[]>([])
  const [focusMetric, setFocusMetric] = useState<XeroMonthMetric | null>(null)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind
    row: XeroMatchRow
  } | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/xero-match/list")
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Load failed (${res.status})`)
      }
      const json = (await res.json()) as {
        matches: XeroMatchRow[]
        focusMetric: XeroMonthMetric
        meta?: { tablesMissing?: boolean }
      }
      setMatches(Array.isArray(json.matches) ? json.matches : [])
      setFocusMetric(json.focusMetric ?? null)
      setTablesMissing(Boolean(json.meta?.tablesMissing))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matches")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = useCallback(
    async (kind: ConfirmKind, row: XeroMatchRow, reasonText?: string) => {
      setBusyKey(`${kind}-${row.id}`)
      try {
        const res = await fetch("/api/finance/xero-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: kind,
            xeroInvoiceId: row.xeroInvoiceId,
            runItemId: row.runItemId,
            reason: reasonText,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string; status?: string }
        if (!res.ok) throw new Error(j.error || res.statusText)
        toast({ title: "Match updated", description: `Status → ${j.status ?? kind}` })
        setConfirm(null)
        await load()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Match action failed",
          description: e instanceof Error ? e.message : "Unknown error",
        })
      } finally {
        setBusyKey(null)
      }
    },
    [load, toast]
  )

  if (loading && matches.length === 0) return <LoadingState rows={6} />
  if (error && matches.length === 0) {
    return <ErrorState title="Could not load matches" message={error} onRetry={() => void load()} />
  }

  const diverged = matches.filter((m) => m.status === "diverged")

  return (
    <div className="space-y-6">
      <XeroMonthHealthStrip metric={focusMetric} loading={loading} />

      {tablesMissing ? (
        <p className="rounded-input border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground">
          PC6 tables not present yet (migration 0011). Matches stay empty until applied.
        </p>
      ) : null}

      {diverged.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Divergence cards</h2>
            <p className="text-xs text-muted-foreground">
              status=diverged · actions: accept / dispute / write-off (admin). Reassign is not
              exposed here.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {diverged.map((row) => (
              <DivergenceCard
                key={row.id}
                row={row}
                busy={busyKey != null}
                onAccept={() => setConfirm({ kind: "accept", row })}
                onDispute={() => {
                  setReason("")
                  setConfirm({ kind: "dispute", row })
                }}
                onWriteOff={() => {
                  setReason("")
                  setConfirm({ kind: "write_off", row })
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">All matches</h2>
            <p className="text-xs text-muted-foreground">
              {matches.length} row{matches.length === 1 ? "" : "s"} · method reference | heuristic |
              manual
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {matches.length === 0 ? (
          <EmptyState
            title="No matches yet"
            message="PC6 match_run_items writes rows during xero-sync. Nothing to show."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MBA / client</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      <p className="num font-medium">{row.invoiceNumber || row.xeroInvoiceId}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {row.invoiceReference || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{row.method}</TableCell>
                    <TableCell className="num text-xs">
                      {Math.round(row.confidence * 1000) / 10}%
                    </TableCell>
                    <TableCell className="num text-right text-xs">
                      {formatAUD(row.deltaCents / 100)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]} size="sm" className="rounded-pill">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>{row.clientName || (row.clientId != null ? `Client ${row.clientId}` : "—")}</p>
                      <p className="num text-[11px] text-muted-foreground">{row.mbaNumber || "—"}</p>
                    </TableCell>
                    <TableCell className="space-y-1 text-xs">
                      {row.mbaNumber ? (
                        <Link
                          href={mbaHref(row.mbaNumber)}
                          className="block font-medium underline-offset-2 hover:underline"
                        >
                          Open MBA
                        </Link>
                      ) : null}
                      {row.clientId != null && row.periodMonth ? (
                        <Link
                          href={invoicingHrefForClientMonth(row.clientId, row.periodMonth)}
                          className="block font-medium underline-offset-2 hover:underline"
                        >
                          Invoicing
                        </Link>
                      ) : null}
                      {!row.mbaNumber && !(row.clientId != null && row.periodMonth) ? "—" : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open && !busyKey) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "accept"
                ? "Accept match"
                : confirm?.kind === "dispute"
                  ? "Dispute match"
                  : "Write off match"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "accept"
                ? "Accepting marks the invoice matched and applies any delta as a run-item adjustment when Δ ≠ 0."
                : confirm?.kind === "dispute"
                  ? "Disputing sets status=disputed and pre-creates an expected credit-note notification for O7 recon."
                  : "Write-off is admin-only and requires a mandatory reason. Status becomes written_off."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.kind === "dispute" || confirm?.kind === "write_off" ? (
            <div className="space-y-1">
              <Label htmlFor="xero-match-reason" className="text-xs text-muted-foreground">
                Reason {confirm.kind === "write_off" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="xero-match-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyKey != null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                busyKey != null ||
                (confirm?.kind === "write_off" && !reason.trim()) ||
                (confirm?.kind === "accept" && confirm.row.runItemId == null)
              }
              onClick={(e) => {
                e.preventDefault()
                if (!confirm) return
                void runAction(confirm.kind, confirm.row, reason.trim() || undefined)
              }}
            >
              {busyKey ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DivergenceCard({
  row,
  busy,
  onAccept,
  onDispute,
  onWriteOff,
}: {
  row: XeroMatchRow
  busy: boolean
  onAccept: () => void
  onDispute: () => void
  onWriteOff: () => void
}) {
  return (
    <div className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="num text-sm font-semibold">{row.invoiceNumber || row.xeroInvoiceId}</p>
          <p className="text-xs text-muted-foreground">
            {row.method} · conf {Math.round(row.confidence * 1000) / 10}% · Δ{" "}
            {formatAUD(row.deltaCents / 100)}
          </p>
        </div>
        <Badge variant="attention" size="sm" className="rounded-pill">
          diverged
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {row.detail || row.cardKind || "Reference matched but amount diverged."}
      </p>
      <p className="text-xs">
        {row.clientName || "—"}
        {row.mbaNumber ? (
          <>
            {" · "}
            <Link href={mbaHref(row.mbaNumber)} className="underline-offset-2 hover:underline">
              {row.mbaNumber}
            </Link>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || row.runItemId == null}
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDispute}>
          Dispute
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onWriteOff}>
          Write off
        </Button>
      </div>
    </div>
  )
}
