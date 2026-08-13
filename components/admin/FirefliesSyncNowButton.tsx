"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export type FirefliesSyncResult = {
  status: "ok" | "error"
  meetingsSeen: number
  notesCreated: number
  unmatched: number
  notesSkipped?: number
  message?: string
}

export function FirefliesSyncNowButton({
  onComplete,
}: {
  onComplete?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FirefliesSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/fireflies-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = (await res.json().catch(() => null)) as
        | FirefliesSyncResult
        | null
      if (!res.ok || !body) {
        throw new Error(
          (body as { message?: string } | null)?.message || `HTTP ${res.status}`
        )
      }
      setResult(body)
      onComplete?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => void run()}
      >
        <RefreshCw className={busy ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>
      {result ? (
        <p className="text-sm text-muted-foreground">
          {result.status === "ok" ? "Last run:" : "Last run failed:"}{" "}
          <span className="num">{result.meetingsSeen}</span> meetings seen
          {" · "}
          <span className="num">{result.notesCreated}</span> notes created
          {" · "}
          <span className="num">{result.unmatched}</span> unattributed
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-status-critical-fg">{error}</p>
      ) : null}
    </div>
  )
}
