"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import type { UploadedAudienceListRow } from "@/lib/planning/upload/uploadedAudienceListTypes"
import { cn } from "@/lib/utils"
import { formatAudienceWc } from "./robustness"

type UploadedAudiencePickerProps = {
  clientId: number | null
  selectedId: number | undefined
  onSelect: (row: UploadedAudienceListRow) => void
  refreshKey?: number
}

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadedAudiencePicker({
  clientId,
  selectedId,
  onSelect,
  refreshKey = 0,
}: UploadedAudiencePickerProps) {
  const [rows, setRows] = useState<UploadedAudienceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const qs =
          clientId != null
            ? `?clients_id=${encodeURIComponent(String(clientId))}`
            : ""
        const res = await fetch(`/api/planning/uploaded-audiences${qs}`)
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `Failed to load (${res.status})`)
        }
        const data = (await res.json()) as unknown
        if (cancelled) return
        setRows(Array.isArray(data) ? (data as UploadedAudienceListRow[]) : [])
      } catch (err) {
        if (cancelled) return
        setRows([])
        setError(err instanceof Error ? err.message : "Failed to load uploaded audiences")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, refreshKey])

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading uploaded audiences…</p>
  }
  if (error) {
    return <p className="text-sm text-status-critical-fg">{error}</p>
  }
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No uploaded audiences yet.</p>
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const selected = selectedId === row.id
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className={cn(
                "interactive-tint w-full rounded-input border border-border p-3 text-left",
                selected && "bg-card shadow-e1 ring-2 ring-ring"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{row.name}</span>
                {row.clients_id == null ? (
                  <Badge variant="outline" size="sm" className="font-normal">
                    Agency
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {row.file_name ?? "—"}
                {" · "}wave {row.wave_code ?? "—"}
                {" · "}n{" "}
                <span className="num text-foreground">{row.unweighted_n ?? "—"}</span>
                {" · "}
                <span className="num text-foreground">
                  {row.audience_wc != null ? formatAudienceWc(row.audience_wc) : "—"}
                </span>
                {"k · "}
                {formatBytes(row.byte_size)}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
