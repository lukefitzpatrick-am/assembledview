"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FirefliesAssignTargetCombobox } from "@/components/admin/FirefliesAssignTargetCombobox"
import { FirefliesSyncNowButton } from "@/components/admin/FirefliesSyncNowButton"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { useToast } from "@/components/ui/use-toast"
import type { AssignTargetOption } from "@/lib/fireflies/assignTargets"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { resolveListViewState } from "@/lib/ui/viewState"

type NotesFilter = "unattributed" | "publisher" | "internal" | "new_business"

type UnattributedNote = {
  id: number
  title: string | null
  meeting_date: string | null
  participants: string | null
  transcript_url: string | null
  duration_seconds: number | null
  attributed_type?: string | null
  candidate_clients?: Array<{ clientId: number; name: string }>
}

type LastSync = {
  meetings_seen: number
  notes_created: number
  unmatched: number
  status: string
  run_finished_at: string | null
} | null

function parseTargetValue(value: string): Record<string, unknown> | null {
  if (value === "internal") return { type: "internal" }
  if (value === "new_business") return { type: "new_business" }
  if (value.startsWith("client:")) {
    const clientId = Number(value.slice("client:".length))
    if (!Number.isFinite(clientId)) return null
    return { type: "client", client_id: clientId }
  }
  if (value.startsWith("publisher:")) {
    const publisherId = Number(value.slice("publisher:".length))
    if (!Number.isFinite(publisherId)) return null
    return { type: "publisher", publisher_id: publisherId }
  }
  return null
}

function FirefliesUnattributedInner() {
  const pageLabel =
    getRouteByExactPath("/admin/fireflies-unattributed")?.label ??
    "Fireflies unattributed"
  const { toast } = useToast()
  const [filter, setFilter] = useState<NotesFilter>("unattributed")
  const [items, setItems] = useState<UnattributedNote[]>([])
  const [targets, setTargets] = useState<AssignTargetOption[]>([])
  const [lastSync, setLastSync] = useState<LastSync>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [targetById, setTargetById] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/fireflies-unattributed?filter=${encodeURIComponent(filter)}`
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(body?.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as {
          items: UnattributedNote[]
          last_sync?: LastSync
          targets?: AssignTargetOption[]
        }
        if (!cancelled) {
          setItems(data.items ?? [])
          setLastSync(data.last_sync ?? null)
          setTargets(data.targets ?? [])
        }
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
  }, [reloadKey, filter])

  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items,
        visible: items,
        filtersActive: filter !== "unattributed",
        clear: () => setFilter("unattributed"),
        retry,
      }),
    [error, filter, items, loading, retry]
  )

  const assign = async (note: UnattributedNote) => {
    const raw = (targetById[note.id] ?? "").trim()
    const target = parseTargetValue(raw)
    if (!target) {
      toast({
        title: "Pick a target",
        description: "Choose a client, publisher, Internal, or New Business.",
        variant: "destructive",
      })
      return
    }
    setSavingId(note.id)
    try {
      const res = await fetch("/api/admin/fireflies-unattributed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: note.id, target }),
      })
      if (!res.ok) throw new Error("Assign failed")
      const body = (await res.json()) as { reattributed?: number }
      toast({
        title: "Assigned",
        description: `Saved; re-attributed ${body.reattributed ?? 0} other note(s).`,
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

  const emptyTitle =
    filter === "unattributed"
      ? lastSync
        ? "No unattributed meetings"
        : "No meetings synced yet"
      : `No ${filter.replace("_", " ")} meetings`

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {pageLabel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign a client, publisher, Internal, or New Business. Client
            mappings always win over publisher. Ambiguous title matches keep
            their hint — pick from the dropdown to resolve.
          </p>
        </div>
        <FirefliesSyncNowButton onComplete={retry} />
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as NotesFilter)}
      >
        <TabsList>
          <TabsTrigger value="unattributed">Unattributed</TabsTrigger>
          <TabsTrigger value="publisher">Publisher</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
          <TabsTrigger value="new_business">New Business</TabsTrigger>
        </TabsList>
      </Tabs>

      <ViewStateBoundary
        state={viewState}
        errorTitle="Couldn't load meetings"
        emptyTitle={emptyTitle}
        emptyMessage={
          filter === "unattributed"
            ? lastSync
              ? "All Fireflies notes are attributed."
              : "No meetings synced yet — Sync now, or the 6-hourly cron runs on the deployed app."
            : "Nothing in this bucket yet."
        }
        emptyAction={
          lastSync || filter !== "unattributed" ? undefined : (
            <FirefliesSyncNowButton onComplete={retry} />
          )
        }
      >
        {(notes) => (
        <div className="rounded-card border border-border bg-card shadow-e1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Attendees</TableHead>
                {filter === "unattributed" ? (
                  <>
                    <TableHead>Assign to</TableHead>
                    <TableHead className="w-[120px]" />
                  </>
                ) : null}
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
                    {n.candidate_clients && n.candidate_clients.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ambiguous:{" "}
                        {n.candidate_clients.map((c) => c.name).join(" · ")}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {n.meeting_date
                      ? new Date(n.meeting_date).toLocaleString("en-AU")
                      : "—"}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {n.participants ?? "—"}
                  </TableCell>
                  {filter === "unattributed" ? (
                    <>
                      <TableCell>
                        <Label className="sr-only" htmlFor={`target-${n.id}`}>
                          Assign to
                        </Label>
                        <FirefliesAssignTargetCombobox
                          id={`target-${n.id}`}
                          options={targets}
                          value={targetById[n.id] ?? ""}
                          onValueChange={(value) =>
                            setTargetById((prev) => ({
                              ...prev,
                              [n.id]: value,
                            }))
                          }
                          disabled={savingId === n.id}
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
                    </>
                  ) : null}
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
