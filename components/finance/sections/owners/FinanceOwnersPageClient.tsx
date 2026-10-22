"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatDateShort } from "@/lib/format/date"
import type { FinanceOwnerRow, FinanceOwnersPayload } from "@/lib/finance/financeOwners"

type Filter = "all" | "unowned"

export function FinanceOwnersPageClient() {
  const { toast } = useToast()
  const [payload, setPayload] = useState<FinanceOwnersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingClientId, setSavingClientId] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/owners")
      const body = (await res.json()) as FinanceOwnersPayload & { message?: string }
      if (!res.ok) throw new Error(body.message ?? "Could not load finance owners.")
      setPayload(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load finance owners.")
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (row: FinanceOwnerRow, teamMemberId: number | null) => {
      setSavingClientId(row.clientId)
      try {
        const res = await fetch("/api/finance/owners", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: row.clientId, team_member_id: teamMemberId }),
        })
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        if (!res.ok) throw new Error(body.message ?? "Could not save the finance owner.")
        toast({ title: teamMemberId == null ? `Owner cleared for ${row.clientName}` : `Owner saved for ${row.clientName}` })
        await load()
      } catch (err) {
        toast({
          title: "Not saved",
          description: err instanceof Error ? err.message : "Could not save the finance owner.",
          variant: "destructive",
        })
      } finally {
        setSavingClientId(null)
      }
    },
    [load, toast],
  )

  const rows = useMemo(() => {
    if (!payload || payload.ready !== true) return []
    const q = search.trim().toLowerCase()
    return payload.rows.filter((row) => {
      if (filter === "unowned" && row.teamMemberId != null) return false
      if (q && !row.clientName.toLowerCase().includes(q)) return false
      return true
    })
  }, [payload, filter, search])

  const ownedCount = payload?.ready ? payload.rows.filter((r) => r.teamMemberId != null).length : 0
  const totalCount = payload?.ready ? payload.rows.length : 0

  return (
    <FinanceSectionsShell
      title="Finance owners"
      headerNote="One named finance owner per client. Shown on the To bill client cards. Any admin can change it."
      scopeBarFramed
      scopeBar={
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Show
            <select
              className="h-9 rounded-input border border-border bg-background px-2 text-sm text-foreground"
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
            >
              <option value="all">All clients</option>
              <option value="unowned">No owner yet</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Client
            <input
              className="h-9 rounded-input border border-border bg-background px-2 text-sm text-foreground"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients"
            />
          </label>
          {payload?.ready ? (
            <p className="pb-2 text-xs text-muted-foreground">
              {ownedCount} of {totalCount} clients have an owner
            </p>
          ) : null}
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-status-critical-fg">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading</p> : null}
      {!loading && payload && payload.ready === false ? (
        <p className="text-sm text-muted-foreground">{payload.message}</p>
      ) : null}
      {!loading && payload?.ready ? (
        rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this view.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Finance owner</TableHead>
                <TableHead>Last changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.clientId}>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>
                    <select
                      aria-label={`Finance owner for ${row.clientName}`}
                      className="h-9 min-w-48 rounded-input border border-border bg-background px-2 text-sm text-foreground"
                      value={row.teamMemberId == null ? "" : String(row.teamMemberId)}
                      disabled={savingClientId === row.clientId}
                      onChange={(event) => {
                        const value = event.target.value
                        void save(row, value === "" ? null : Number(value))
                      }}
                    >
                      <option value="">No owner</option>
                      {payload.candidates.map((member) => (
                        <option key={member.id} value={String(member.id)}>
                          {member.name}
                        </option>
                      ))}
                      {row.teamMemberId != null &&
                      !payload.candidates.some((member) => member.id === row.teamMemberId) ? (
                        <option value={String(row.teamMemberId)}>{row.ownerName ?? "Inactive member"}</option>
                      ) : null}
                    </select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.updatedAt
                      ? `${formatDateShort(row.updatedAt)}${row.updatedByName ? ` by ${row.updatedByName}` : ""}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      ) : null}
    </FinanceSectionsShell>
  )
}
