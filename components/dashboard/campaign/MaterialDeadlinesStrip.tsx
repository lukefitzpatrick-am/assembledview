"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  formatSydneyDeadlineLabel,
  type MaterialDeadlineStripItem,
} from "@/lib/specs/deriveMaterialDeadlines"
import { cn } from "@/lib/utils"

type Props = {
  mbaNumber: string
  canOverride?: boolean
  className?: string
  /** Inclusive ISO yyyy-mm-dd. Both required to hide deadlines outside the window. */
  rangeStart?: string | null
  rangeEnd?: string | null
}

/**
 * Per-publisher material dates (nearest first). Renders nothing when no
 * structured deadlines exist. Urgent = within 5 Sydney business days or past.
 */
export function MaterialDeadlinesStrip({
  mbaNumber,
  canOverride = false,
  className,
  rangeStart,
  rangeEnd,
}: Props) {
  const [items, setItems] = useState<MaterialDeadlineStripItem[] | null>(null)
  const [hidden, setHidden] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/mediaplans/mba/${encodeURIComponent(mbaNumber.trim())}/material-deadlines`,
        )
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          if (!cancelled) setHidden(true)
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { items?: MaterialDeadlineStripItem[] }
        if (!cancelled) setItems(Array.isArray(body.items) ? body.items : [])
      } catch {
        if (!cancelled) setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mbaNumber])

  if (hidden) return null
  if (items == null) return null
  const visible =
    rangeStart && rangeEnd
      ? items.filter(
          (item) => item.displayYmd >= rangeStart && item.displayYmd <= rangeEnd,
        )
      : items
  if (visible.length === 0) return null

  async function saveOverride(item: MaterialDeadlineStripItem) {
    const overrideYmd = (draft[item.publisherKey] ?? item.displayYmd).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideYmd)) return
    setSaving(item.publisherKey)
    try {
      const res = await fetch(
        `/api/mediaplans/mba/${encodeURIComponent(mbaNumber.trim())}/material-deadlines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publisherKey: item.publisherKey,
            derivedYmd: item.derivedYmd,
            overrideYmd,
          }),
        },
      )
      if (!res.ok) return
      setItems((prev) =>
        (prev ?? []).map((row) =>
          row.publisherKey === item.publisherKey
            ? {
                ...row,
                displayYmd: overrideYmd,
                override: {
                  publisherKey: item.publisherKey,
                  derivedYmd: item.derivedYmd,
                  overrideYmd,
                  overriddenBy: "you",
                  overriddenAt: new Date().toISOString(),
                },
              }
            : row,
        ),
      )
    } finally {
      setSaving(null)
    }
  }

  return (
    <section
      aria-label="Material deadlines"
      className={cn(
        "rounded-card border border-border bg-card p-4 shadow-e1 sm:p-5",
        className,
      )}
    >
      <h2 className="mb-3 text-sm font-semibold text-foreground">Material deadlines</h2>
      <ul className="divide-y divide-border/60">
        {visible.map((item) => (
          <li
            key={item.publisherKey}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{item.publisherLabel}</p>
              <p
                className={cn(
                  "num text-sm",
                  item.urgent ? "text-status-critical-fg" : "text-muted-foreground",
                )}
              >
                {formatSydneyDeadlineLabel(item.displayYmd)}
                {item.override ? (
                  <>
                    {" "}
                    <s className="text-muted-foreground">
                      {formatSydneyDeadlineLabel(item.derivedYmd)}
                    </s>
                  </>
                ) : null}
              </p>
            </div>
            {canOverride ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="h-9 w-40"
                  value={draft[item.publisherKey] ?? item.displayYmd}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      [item.publisherKey]: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving === item.publisherKey}
                  onClick={() => void saveOverride(item)}
                >
                  Override
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
