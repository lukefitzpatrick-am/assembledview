"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { useToast } from "@/components/ui/use-toast"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { resolveListViewState } from "@/lib/ui/viewState"

type UnattributedNote = {
  id: number
  title: string | null
  meeting_date: string | null
  participants: string | null
  transcript_url: string | null
  duration_seconds: number | null
}

function FirefliesUnattributedInner() {
  const pageLabel =
    getRouteByExactPath("/admin/fireflies-unattributed")?.label ??
    "Fireflies unattributed"
  const { toast } = useToast()
  const [items, setItems] = useState<UnattributedNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [clientById, setClientById] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch("/api/admin/fireflies-unattributed")
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(body?.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as { items: UnattributedNote[] }
        if (!cancelled) setItems(data.items ?? [])
      } catch (e) {
        if (!cancelled) {
          setItems([])
          setError(e instanceof Error ? e.message : "Failed to load")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items,
        visible: items,
        filtersActive: false,
        clear: () => {},
        retry,
      }),
    [error, items, loading, retry]
  )

  const assign = async (note: UnattributedNote) => {
    const clientRaw = (clientById[note.id] ?? "").trim()
    const client_id = Number(clientRaw)
    if (!Number.isFinite(client_id)) {
      toast({
        title: "Client id required",
        description: "Enter a numeric clients.id",
        variant: "destructive",
      })
      return
    }
    setSavingId(note.id)
    try {
      const res = await fetch("/api/admin/fireflies-unattributed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: note.id, client_id }),
      })
      if (!res.ok) throw new Error("Assign failed")
      const body = (await res.json()) as { reattributed?: number }
      toast({
        title: "Assigned",
        description: `Learned domains; re-attributed ${body.reattributed ?? 0} other note(s).`,
      })
      setReloadKey((k) => k + 1)
    } catch (e) {
      toast({
        title: "Assign failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {pageLabel}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meetings with no MBA title match and no known attendee domain. Assign
          a client once — the domain is learned for next sync (MR-5).
        </p>
      </div>

      <ViewStateBoundary
        state={viewState}
        errorTitle="Couldn't load unattributed meetings"
        emptyTitle="No unattributed meetings"
        emptyMessage="All Fireflies notes are attributed or internal."
      >
        {(notes) => (
        <div className="rounded-card border border-border bg-card shadow-e1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Attendees</TableHead>
                <TableHead>Client id</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((n) => (
                <TableRow key={n.id} className="interactive-row">
                  <TableCell>
                    {n.transcript_url ? (
                      <a
                        href={n.transcript_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {n.title || "(untitled)"}
                      </a>
                    ) : (
                      n.title || "(untitled)"
                    )}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {n.meeting_date
                      ? new Date(n.meeting_date).toLocaleString("en-AU")
                      : "—"}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {n.participants ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Label className="sr-only" htmlFor={`client-${n.id}`}>
                      Client id
                    </Label>
                    <Input
                      id={`client-${n.id}`}
                      className="h-8 w-28"
                      inputMode="numeric"
                      value={clientById[n.id] ?? ""}
                      onChange={(e) =>
                        setClientById((prev) => ({
                          ...prev,
                          [n.id]: e.target.value,
                        }))
                      }
                      placeholder="id"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      disabled={savingId === n.id}
                      onClick={() => void assign(n)}
                    >
                      Assign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </ViewStateBoundary>
    </div>
  )
}

export default function FirefliesUnattributedPage() {
  return (
    <AdminGuard>
      <FirefliesUnattributedInner />
    </AdminGuard>
  )
}
