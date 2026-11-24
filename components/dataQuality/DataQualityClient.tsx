"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { HelpTip } from "@/components/help/Help"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { announce } from "@/components/ui/announcer"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useFieldErrors } from "@/hooks/use-field-errors"
import { daysOpen, isOverdue, ruleLabel, type DataQualityItem } from "@/lib/dataQuality/rules"

const SELECT_CLASS = "h-10 w-full rounded-input border border-border bg-background px-3 text-sm"

/** Owner filter values besides an email. */
const ALL = ""
const ME = "me"
const NONE = "none"

const ownerLabel = (item: Pick<DataQualityItem, "ownerEmail" | "ownerName">) =>
  item.ownerName ?? item.ownerEmail ?? "Unassigned"

export function DataQualityClient({
  viewerEmail,
  overviewByDefault,
}: {
  viewerEmail: string
  /** The ops list (Luke): every owner, overdue only. Everyone else: their own items. */
  overviewByDefault: boolean
}) {
  const [items, setItems] = useState<DataQualityItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [owner, setOwner] = useState(overviewByDefault ? ALL : ME)
  const [rule, setRule] = useState("")
  const [client, setClient] = useState("")
  const [overdueOnly, setOverdueOnly] = useState(overviewByDefault)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [resolving, setResolving] = useState<DataQualityItem | null>(null)
  const [dismissing, setDismissing] = useState<DataQualityItem | null>(null)
  const [reason, setReason] = useState("")
  const reasonErrors = useFieldErrors({ reason: "Reason" })

  useEffect(() => {
    let live = true
    setLoadError(false)
    fetch("/api/data-quality", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body = (await res.json()) as { items: DataQualityItem[] }
        if (live) setItems(body.items)
      })
      .catch(() => {
        if (live) setLoadError(true)
      })
    return () => {
      live = false
    }
  }, [reloadKey])

  const at = new Date()
  const options = useMemo(() => {
    const owners = new Map<string, string>()
    const rules = new Set<string>()
    const clients = new Map<string, string>()
    for (const item of items ?? []) {
      if (item.ownerEmail) owners.set(item.ownerEmail, ownerLabel(item))
      rules.add(item.ruleKey)
      if (item.clientId != null) clients.set(String(item.clientId), item.clientName ?? `Client ${item.clientId}`)
    }
    const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1])
    return {
      owners: [...owners].sort(byLabel),
      rules: [...rules].sort((a, b) => ruleLabel(a).localeCompare(ruleLabel(b))),
      clients: [...clients].sort(byLabel),
    }
  }, [items])

  // Overdue first; the list arrives oldest first, and the sort keeps that order within each group.
  const shown = (items ?? []).filter(
    (item) =>
      (owner === ALL ||
        (owner === ME ? item.ownerEmail === viewerEmail : owner === NONE ? item.ownerEmail == null : item.ownerEmail === owner)) &&
      (!rule || item.ruleKey === rule) &&
      (!client || String(item.clientId) === client) &&
      (!overdueOnly || isOverdue(item, at)),
  ).sort((a, b) => Number(isOverdue(b, at)) - Number(isOverdue(a, at)))

  const close = useCallback(async (item: DataQualityItem, body: { action: "resolve" } | { action: "dismiss"; reason: string }) => {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/data-quality/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      // 404: someone else (or the check) already closed it; it leaves the list either way.
      if (!res.ok && res.status !== 404) throw new Error(`status ${res.status}`)
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id))
      announce(`${body.action === "resolve" ? "Resolved" : "Dismissed"}: ${ruleLabel(item.ruleKey)} on ${item.mbaNumber}.`)
      return true
    } catch {
      announce(`Could not update ${item.mbaNumber}. Try again.`, "assertive")
      return false
    } finally {
      setBusyId(null)
    }
  }, [])

  const confirmResolve = async () => {
    if (resolving && (await close(resolving, { action: "resolve" }))) setResolving(null)
  }

  const openDismiss = (item: DataQualityItem) => {
    setReason("")
    reasonErrors.clear("reason")
    setDismissing(item)
  }

  const saveDismiss = async () => {
    if (!dismissing) return
    const text = reason.trim()
    if (!reasonErrors.check({ reason: text ? undefined : "Say why this is not a problem" })) return
    if (await close(dismissing, { action: "dismiss", reason: text })) setDismissing(null)
  }

  return (
    <PageShell>
      <PageHeader
        title="Data quality"
        lede="Problems the app's checks found, assigned to the plan owner. Fix each one from its link, then resolve it."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filters">
        <div className="space-y-1">
          <Label htmlFor="dq-owner">Owner</Label>
          <select id="dq-owner" className={SELECT_CLASS} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value={ALL}>All owners</option>
            <option value={ME}>Mine</option>
            <option value={NONE}>Unassigned</option>
            {options.owners.map(([email, name]) => (
              <option key={email} value={email}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dq-rule">Rule</Label>
          <select id="dq-rule" className={SELECT_CLASS} value={rule} onChange={(e) => setRule(e.target.value)}>
            <option value="">All rules</option>
            {options.rules.map((key) => (
              <option key={key} value={key}>
                {ruleLabel(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dq-client">Client</Label>
          <select id="dq-client" className={SELECT_CLASS} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>
            {options.clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input
            id="dq-overdue"
            type="checkbox"
            className="h-4 w-4"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          <Label htmlFor="dq-overdue">Overdue only</Label>
        </div>
      </div>

      {loadError ? (
        <ErrorState message="The queue could not be loaded." onRetry={() => setReloadKey((k) => k + 1)} />
      ) : items == null ? (
        <LoadingState aria-label="Loading the queue" />
      ) : shown.length === 0 ? (
        <EmptyState title="Nothing to show" message={items.length === 0 ? "No open data problems." : "No open items match these filters."} />
      ) : (
        <Table>
          <caption className="sr-only">
            {`${shown.length} of ${items.length} open ${items.length === 1 ? "item" : "items"}`}
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Plan</TableHead>
              <TableHead scope="col">Line</TableHead>
              <TableHead scope="col">Problem</TableHead>
              <TableHead scope="col">Owner</TableHead>
              <TableHead scope="col">
                Open
                <HelpTip id="dataQualityOpen" label="Open" />
              </TableHead>
              <TableHead scope="col">Fix</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((item) => {
              const days = daysOpen(item.firstSeenAt, at)
              const name = `${ruleLabel(item.ruleKey)} on ${item.mbaNumber}${item.lineItemId ? ` line ${item.lineItemId}` : ""}`
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.mbaNumber}</div>
                    {item.clientName ? <div className="text-xs text-muted-foreground">{item.clientName}</div> : null}
                  </TableCell>
                  <TableCell>{item.lineItemId ?? "Whole plan"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{ruleLabel(item.ruleKey)}</div>
                    <div className="text-sm text-muted-foreground">{item.message}</div>
                  </TableCell>
                  <TableCell>{ownerLabel(item)}</TableCell>
                  <TableCell>
                    {days === 1 ? "1 day" : `${days} days`}
                    {isOverdue(item, at) ? <span className="ml-2 font-semibold text-status-critical-fg">Overdue</span> : null}
                  </TableCell>
                  <TableCell>
                    <Link href={item.fixHref} className="underline underline-offset-2" aria-label={`${item.fixLabel}: ${name}`}>
                      {item.fixLabel}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === item.id}
                        aria-label={`Resolve ${name}`}
                        onClick={() => setResolving(item)}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === item.id}
                        aria-label={`Dismiss ${name}`}
                        onClick={() => openDismiss(item)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={resolving != null} onOpenChange={(open) => (open ? null : setResolving(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve this item</DialogTitle>
            <DialogDescription>
              {resolving ? `${ruleLabel(resolving.ruleKey)} on ${resolving.mbaNumber}. ` : ""}Resolve it once the plan is
              fixed. If the daily check still finds the problem, it opens again as a new item.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResolving(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="action"
              disabled={resolving != null && busyId === resolving.id}
              onClick={() => void confirmResolve()}
            >
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dismissing != null} onOpenChange={(open) => (open ? null : setDismissing(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this item</DialogTitle>
            <DialogDescription>
              {dismissing ? `${ruleLabel(dismissing.ruleKey)} on ${dismissing.mbaNumber}. ` : ""}A dismissed item does not come back.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveDismiss()
            }}
            noValidate
            className="space-y-2"
          >
            <Label htmlFor={reasonErrors.control("reason").id}>Reason</Label>
            <Textarea
              {...reasonErrors.control("reason")}
              value={reason}
              maxLength={1000}
              onChange={(e) => {
                reasonErrors.clear("reason")
                setReason(e.target.value)
              }}
            />
            {reasonErrors.message("reason")}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDismissing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="action" disabled={dismissing != null && busyId === dismissing.id}>
                Dismiss
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
