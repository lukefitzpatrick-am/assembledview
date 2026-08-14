"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarDays } from "lucide-react"
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/layout/Panel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { formatDateShort } from "@/lib/format/date"
import type { ClientMeeting } from "@/lib/clients/selectClientMeetings"

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—"
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

export function ClientMeetingsSection({ clientId }: { clientId: number }) {
  const [items, setItems] = useState<ClientMeeting[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/clients/${encodeURIComponent(String(clientId))}/meetings`,
      )
      if (res.status === 403) {
        setItems(null)
        setError(null)
        setLoading(false)
        return
      }
      const json = (await res.json()) as { items?: ClientMeeting[]; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch (e) {
      setItems(null)
      setError(e instanceof Error ? e.message : "Failed to load meetings")
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <LoadingState rows={3} />
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load meetings"
        message={error}
        onRetry={() => void load()}
      />
    )
  }

  if (!items) return null

  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>Meetings</PanelTitle>
          <PanelDescription>
            Fireflies transcripts for this client.
          </PanelDescription>
        </div>
      </PanelHeader>
      <PanelContent>
        {items.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden />}
            title="No meetings yet"
            message="No meetings attributed to this client yet — assign them from Fireflies meetings."
            action={
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/fireflies-unattributed">Fireflies meetings</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => {
                const expanded = expandedId === m.id
                return (
                <TableRow key={m.id} className="interactive-row">
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      className="text-left text-primary underline-offset-2 hover:underline"
                      onClick={() =>
                        setExpandedId((cur) => (cur === m.id ? null : m.id))
                      }
                    >
                      {m.title || "(untitled)"}
                    </button>
                    {m.transcript_url ? (
                      <a
                        href={m.transcript_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Transcript
                      </a>
                    ) : null}
                    {expanded ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {m.summary?.trim() || "No summary stored for this meeting."}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {formatDateShort(m.meeting_date)}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {formatDuration(m.duration_seconds)}
                  </TableCell>
                  <TableCell>
                    {m.auto_created_tasks ? (
                      <Badge variant="info" size="sm">
                        Auto-created tasks
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </PanelContent>
    </Panel>
  )
}
