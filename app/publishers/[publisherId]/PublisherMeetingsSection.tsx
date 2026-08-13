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
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { formatDateShort } from "@/lib/format/date"
import type { Publisher } from "@/lib/types/publisher"

type MeetingRow = {
  id: number
  title: string | null
  meeting_date: string | null
  duration_seconds: number | null
  transcript_url: string | null
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—"
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

export function PublisherMeetingsSection({ publisher }: { publisher: Publisher }) {
  const [items, setItems] = useState<MeetingRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/publishers/${encodeURIComponent(String(publisher.publisherid).trim())}/meetings`,
      )
      if (res.status === 403) {
        setItems(null)
        setError(null)
        setLoading(false)
        return
      }
      const json = (await res.json()) as { items?: MeetingRow[]; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch (e) {
      setItems(null)
      setError(e instanceof Error ? e.message : "Failed to load meetings")
    } finally {
      setLoading(false)
    }
  }, [publisher.publisherid])

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
            Fireflies transcripts attributed to this publisher.
          </PanelDescription>
        </div>
      </PanelHeader>
      <PanelContent>
        {items.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden />}
            title="No meetings yet"
            message="No meetings attributed to this publisher yet — assign them from Fireflies unattributed."
            action={
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/fireflies-unattributed">Fireflies unattributed</Link>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id} className="interactive-row">
                  <TableCell>
                    {m.transcript_url ? (
                      <a
                        href={m.transcript_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {m.title || "(untitled)"}
                      </a>
                    ) : (
                      m.title || "(untitled)"
                    )}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {formatDateShort(m.meeting_date)}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {formatDuration(m.duration_seconds)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelContent>
    </Panel>
  )
}
