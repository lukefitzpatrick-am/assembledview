"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clickBlobDownload } from "@/lib/docs/clickBlobDownload"
import {
  aaCycleDates,
  billingMonthLabel,
  defaultBillingMonth,
  formatCycleDate,
  monthsChangedLabel,
  type BillingPartnerDueRow,
  type BillingPartnerPackRow,
  type BillingPartnerPagePayload,
} from "@/lib/finance/billingPartner/cycle"

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

function initialMonth(raw: string | null): string {
  if (raw && MONTH_KEY.test(raw)) return raw
  if (raw && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(raw)) return raw.slice(0, 7)
  return defaultBillingMonth().slice(0, 7)
}

function formatSydney(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] || "AA pack.zip"
}

export function BillingPartnerPageClient() {
  const params = useSearchParams()
  const [month, setMonth] = useState(() => initialMonth(params.get("month")))
  const [payload, setPayload] = useState<BillingPartnerPagePayload | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [sentTarget, setSentTarget] = useState<BillingPartnerPackRow | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const load = useCallback(async (billingMonth: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/finance/billing-partner?month=${billingMonth}`)
      const body = (await response.json()) as BillingPartnerPagePayload & { error?: string }
      if (!response.ok) {
        throw new Error(body.error || "Could not load billing partner plans")
      }
      setPayload(body)
      setSelected(body.due.map((row) => row.versionId))
    } catch (err) {
      setPayload(null)
      setSelected([])
      setError(err instanceof Error ? err.message : "Could not load billing partner plans")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(month)
  }, [load, month])

  const due = payload?.due ?? []
  const allSelected = due.length > 0 && due.every((row) => selected.includes(row.versionId))
  const dates = aaCycleDates(`${month}-01`)
  const monthLabel = billingMonthLabel(`${month}-01`)

  async function buildPack() {
    setBuilding(true)
    setBuildError(null)
    try {
      const response = await fetch("/api/finance/billing-partner/packs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingMonth: month, versionIds: selected }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || "Pack was not built")
      }
      const blob = await response.blob()
      clickBlobDownload(blob, filenameFromDisposition(response.headers.get("Content-Disposition")))
      await load(month)
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Pack was not built")
    } finally {
      setBuilding(false)
    }
  }

  async function confirmSent() {
    if (!sentTarget) return
    setSending(true)
    setSendError(null)
    try {
      const response = await fetch(`/api/finance/billing-partner/packs/${sentTarget.id}/sent`, {
        method: "POST",
      })
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(body?.error || "Pack was not marked sent")
      }
      setSentTarget(null)
      await load(month)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Pack was not marked sent")
    } finally {
      setSending(false)
    }
  }

  function toggle(versionId: number) {
    setSelected((current) =>
      current.includes(versionId)
        ? current.filter((id) => id !== versionId)
        : [...current, versionId],
    )
  }

  return (
    <FinanceSectionsShell
      title="Billing partner"
      accent={monthLabel}
      headerNote={`Advertising Associates dates: ${dates.map((date) => formatCycleDate(date.ymd)).join(", ")}.`}
      scopeBar={
        <label className="flex flex-wrap items-center gap-3 text-sm text-foreground">
          <span>Billing month</span>
          <Input
            type="month"
            value={month}
            className="w-44"
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      }
    >
      {loading ? <LoadingState rows={6} /> : null}
      {!loading && error ? (
        <ErrorState message={error} onRetry={() => void load(month)} />
      ) : null}
      {!loading && !error ? (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Due plans</h2>
                <p className="text-sm text-muted-foreground">
                  A draft pack stays due until it is marked sent.
                </p>
              </div>
              <Button
                type="button"
                disabled={building || selected.length === 0}
                onClick={() => void buildPack()}
              >
                {building ? "Building pack…" : `Build pack (${selected.length})`}
              </Button>
            </div>
            {buildError ? <p className="text-sm text-status-critical-fg">{buildError}</p> : null}
            {due.length === 0 ? (
              <EmptyState
                title="Nothing due"
                message="No Advertising Associates plans are due for this month."
              />
            ) : (
              <div className="rounded-card border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={allSelected}
                          aria-label="Select all due plans"
                          onChange={() =>
                            setSelected(allSelected ? [] : due.map((row) => row.versionId))
                          }
                        />
                      </TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>MBA</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Published at</TableHead>
                      <TableHead>Published by</TableHead>
                      <TableHead>New/Amended</TableHead>
                      <TableHead>Months changed</TableHead>
                      <TableHead>Back-dated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {due.map((row) => (
                      <DueRow
                        key={row.versionId}
                        row={row}
                        checked={selected.includes(row.versionId)}
                        onToggle={toggle}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Packs</h2>
            {(payload?.packs.length ?? 0) === 0 ? (
              <EmptyState title="No packs" message="Build a pack to send the workbooks." />
            ) : (
              <div className="rounded-card border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Download</TableHead>
                      <TableHead>Sent at</TableHead>
                      <TableHead>Sent by</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload?.packs.map((pack) => (
                      <TableRow key={pack.id}>
                        <TableCell>
                          <div>{formatSydney(pack.createdAt)}</div>
                          <div className="text-xs text-muted-foreground">{pack.id}</div>
                        </TableCell>
                        <TableCell>{pack.createdBy}</TableCell>
                        <TableCell>
                          <Badge variant={pack.status === "sent" ? "good" : "neutral"}>
                            {pack.status === "sent" ? "Sent" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="num">{pack.itemCount}</TableCell>
                        <TableCell>
                          <a
                            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                            href={`/api/finance/billing-partner/packs/${pack.id}/download`}
                          >
                            Download
                          </a>
                        </TableCell>
                        <TableCell>{formatSydney(pack.sentAt)}</TableCell>
                        <TableCell>{pack.sentBy ?? "—"}</TableCell>
                        <TableCell>
                          {pack.status === "draft" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSendError(null)
                                setSentTarget(pack)
                              }}
                            >
                              Mark as sent
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <AlertDialog
        open={sentTarget != null}
        onOpenChange={(open) => {
          if (sending) return
          if (!open) {
            setSentTarget(null)
            setSendError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this pack as sent?</AlertDialogTitle>
            <AlertDialogDescription>
              This records that the pack was sent to Advertising Associates. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {sendError ? <p className="text-sm text-status-critical-fg">{sendError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(event) => {
                event.preventDefault()
                void confirmSent()
              }}
            >
              {sending ? "Marking sent…" : "Mark as sent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FinanceSectionsShell>
  )
}

function DueRow({
  row,
  checked,
  onToggle,
}: {
  row: BillingPartnerDueRow
  checked: boolean
  onToggle: (versionId: number) => void
}) {
  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={checked}
          aria-label={`Include ${row.mbaNumber} version ${row.versionNumber}`}
          onChange={() => onToggle(row.versionId)}
        />
      </TableCell>
      <TableCell>{row.clientName || "—"}</TableCell>
      <TableCell>{row.campaignName || "—"}</TableCell>
      <TableCell>{row.mbaNumber}</TableCell>
      <TableCell className="num">{row.versionNumber}</TableCell>
      <TableCell>{formatSydney(row.publishedAt)}</TableCell>
      <TableCell>{row.publishedBy ?? "—"}</TableCell>
      <TableCell>{row.changeKind === "new" ? "New" : "Amended"}</TableCell>
      <TableCell>{monthsChangedLabel(row.monthsChanged, row.comparedTo)}</TableCell>
      <TableCell>
        {row.backDated ? <Badge variant="attention">Back-dated</Badge> : "—"}
      </TableCell>
    </TableRow>
  )
}
