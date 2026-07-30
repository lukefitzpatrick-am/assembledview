"use client"

import { useCallback, useEffect, useState } from "react"
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
import { cn } from "@/lib/utils"
import { formatAUD } from "@/lib/format/money"
import type { FinancePeriod, FinanceRunItem, AppNotification } from "@/lib/finance/periods/types"
import { effectiveAmountCents } from "@/lib/finance/periods/reviewItem"

type PeriodsPayload = {
  mode: string
  periods: FinancePeriod[]
  items: FinanceRunItem[]
  notifications: AppNotification[]
  unread: number
}

const STATUS_CHIP: Record<string, "good" | "attention" | "secondary" | "blocking"> = {
  open: "secondary",
  pre_run_review: "attention",
  run: "attention",
  review: "attention",
  locked: "good",
  invoiced: "good",
  reconciled: "good",
}

/**
 * PC5 — left period rail + run-item review + notification list.
 * Visible when FINANCE_PERIODS=shadow|on (API returns empty when off).
 */
export function FinancePeriodRail({ className }: { className?: string }) {
  const [data, setData] = useState<PeriodsPayload | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (periodMonth?: string | null) => {
    setError(null)
    const q = periodMonth ? `?periodMonth=${encodeURIComponent(periodMonth)}` : ""
    const res = await fetch(`/api/finance/periods${q}`)
    if (!res.ok) {
      setError("Failed to load periods")
      return
    }
    const json = (await res.json()) as PeriodsPayload
    setData(json)
    if (!periodMonth && json.periods[0] && !selected) {
      setSelected(json.periods[0].periodMonth)
    }
  }, [selected])

  useEffect(() => {
    void load(selected)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional load on select

  useEffect(() => {
    void load(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || data.mode === "off") {
    return null
  }

  const review = async (
    action: string,
    itemId: number,
    reason?: string,
    adjustmentCents?: number
  ) => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch("/api/finance/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          periodMonth: selected,
          itemId,
          reason,
          adjustmentCents: adjustmentCents ?? 0,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(String((j as { error?: string }).error ?? res.statusText))
      } else {
        await load(selected)
      }
    } finally {
      setBusy(false)
    }
  }

  const runNow = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await fetch("/api/admin/finance-periods/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonth: selected }),
      })
      await load(selected)
    } finally {
      setBusy(false)
    }
  }

  const exportItems = () => {
    if (!data.items.length || !selected) return
    const header = ["source", "invoice_reference", "status", "amount", "effective"]
    const lines = data.items.map((i) =>
      [
        i.source,
        i.invoiceReference,
        i.status,
        (i.amountCents / 100).toFixed(2),
        (effectiveAmountCents(i) / 100).toFixed(2),
      ].join(",")
    )
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `finance_run_${selected}.csv`
    a.click()
  }

  return (
    <div className={cn("flex min-h-[24rem] gap-3", className)}>
      <aside className="w-44 shrink-0 space-y-1 rounded-card border border-border bg-surface-panel p-2 shadow-e1">
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-xs font-medium text-muted-foreground">Periods</p>
          {data.unread > 0 ? (
            <Badge variant="attention" size="sm" className="rounded-pill">
              {data.unread}
            </Badge>
          ) : null}
        </div>
        {data.periods.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No periods yet</p>
        ) : (
          data.periods.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "interactive-tint flex w-full items-center justify-between rounded-input px-2 py-1.5 text-left text-sm",
                selected === p.periodMonth && "bg-muted"
              )}
              onClick={() => setSelected(p.periodMonth)}
            >
              <span className="num">{p.periodMonth}</span>
              <Badge
                variant={STATUS_CHIP[p.status] ?? "secondary"}
                size="sm"
                className="rounded-pill font-normal"
              >
                {p.status}
                {p.amendedAfterLock ? " *" : ""}
              </Badge>
            </button>
          ))
        )}
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || !selected} onClick={() => void runNow()}>
            Run now
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={!data.items.length} onClick={exportItems}>
            Export CSV
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        {error ? (
          <p className="rounded-input border border-status-critical-fg/30 bg-status-critical-bg px-2 py-1 text-sm text-status-critical-fg">
            {error}
          </p>
        ) : null}

        <div className="overflow-auto rounded-card border border-border bg-card shadow-e1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No run items for this period.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.invoiceReference}</TableCell>
                    <TableCell className="text-sm">{item.source}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm" className="rounded-pill">
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="num text-right text-sm">
                      {formatAUD(effectiveAmountCents(item) / 100)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={busy}
                          onClick={() => void review("approve", item.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={busy}
                          onClick={() => {
                            const adjRaw = window.prompt(
                              "Adjustment cents (can be negative; original amount kept)",
                              "0"
                            )
                            if (adjRaw == null) return
                            const reason = window.prompt("Adjust reason (required)") || ""
                            if (!reason) return
                            const adjustmentCents = Number(adjRaw)
                            if (!Number.isFinite(adjustmentCents)) return
                            void review("adjust", item.id, reason, adjustmentCents)
                          }}
                        >
                          Adjust
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("Hold reason") || ""
                            if (reason) void review("hold", item.id, reason)
                          }}
                        >
                          Hold
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("Exclude reason") || ""
                            if (reason) void review("exclude", item.id, reason)
                          }}
                        >
                          Exclude
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-card border border-border bg-surface-panel p-3 shadow-e1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Notifications {data.unread > 0 ? `(${data.unread} unread)` : ""}
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {data.notifications.length === 0 ? (
              <li className="text-muted-foreground">None</li>
            ) : (
              data.notifications.map((n) => (
                <li key={n.id} className={cn(!n.readAt && "font-medium")}>
                  <span className="text-muted-foreground">{n.kind}</span>
                  {" — "}
                  <span className="text-xs">{new Date(n.createdAt).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
