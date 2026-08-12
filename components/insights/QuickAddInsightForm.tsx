"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const INSIGHT_TYPES = ["delivery", "audience", "creative", "channel", "commercial"] as const

type QuickAddInsightFormProps = {
  clientId?: number | null
  mbaNumber?: string | null
  /** Default period YYYY-MM (optional). */
  defaultPeriod?: string | null
  className?: string
  onCreated?: () => void
  compact?: boolean
}

/**
 * Fifteen-second human insight capture — campaign page + /insights.
 * POSTs to /api/insights (admin-gated). Never deletes.
 */
export function QuickAddInsightForm({
  clientId,
  mbaNumber,
  defaultPeriod,
  className,
  onCreated,
  compact = false,
}: QuickAddInsightFormProps) {
  const [open, setOpen] = useState(!compact)
  const [body, setBody] = useState("")
  const [insightType, setInsightType] = useState<(typeof INSIGHT_TYPES)[number]>("delivery")
  const [period, setPeriod] = useState(defaultPeriod ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSubmit =
    body.trim().length > 0 && (clientId != null || (mbaNumber != null && mbaNumber.trim() !== ""))

  function reset() {
    setBody("")
    setInsightType("delivery")
    setPeriod(defaultPeriod ?? "")
    setError(null)
  }

  function submit() {
    if (!canSubmit || pending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: clientId ?? undefined,
            mbaNumber: mbaNumber?.trim().toLowerCase() || undefined,
            body: body.trim(),
            insightType,
            period: period.trim() || null,
          }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { message?: string } | null
          setError(data?.message || "Could not save insight.")
          return
        }
        reset()
        if (compact) setOpen(false)
        onCreated?.()
      } catch {
        setError("Could not save insight.")
      }
    })
  }

  if (compact && !open) {
    return (
      <div className={cn(className)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="interactive gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={1.8} />
          Add insight
        </Button>
      </div>
    )
  }

  return (
    <form
      className={cn(
        "space-y-3 rounded-card border border-border bg-card p-4 shadow-e1",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {compact ? "Quick add" : "Record an insight"}
        </h3>
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              reset()
              setOpen(false)
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">What did you learn?</span>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="One sentence is enough…"
          rows={compact ? 2 : 3}
          className="resize-y"
          maxLength={4000}
          required
        />
      </label>

      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <select
            className="flex h-10 w-full rounded-input border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={insightType}
            onChange={(e) => setInsightType(e.target.value as (typeof INSIGHT_TYPES)[number])}
          >
            {INSIGHT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Period (optional)</span>
          <Input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="YYYY-MM"
            inputMode="numeric"
          />
        </label>
        {!compact && mbaNumber ? (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">MBA</span>
            <p className="flex h-10 items-center text-sm uppercase tracking-wide text-muted-foreground">
              {mbaNumber}
            </p>
          </div>
        ) : null}
      </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit || pending} size="sm">
          {pending ? "Saving…" : "Save insight"}
        </Button>
        {!canSubmit ? (
          <span className="text-xs text-muted-foreground">Needs a client or MBA scope.</span>
        ) : null}
      </div>
    </form>
  )
}
