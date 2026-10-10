"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"

import { InsightScopePickers } from "@/components/insights/InsightScopePickers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  INSIGHT_OUTCOME_KINDS,
  buildInsightCreatePayload,
  type InsightOutcomeKind,
} from "@/lib/insights/insightActionFields"
import { cn } from "@/lib/utils"

const INSIGHT_TYPES = ["delivery", "audience", "creative", "channel", "commercial"] as const
const selectClass =
  "flex h-10 w-full rounded-input border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

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
  const lockedScope = clientId != null || Boolean(mbaNumber?.trim())
  const [pickedClientId, setPickedClientId] = useState("")
  const [pickedMba, setPickedMba] = useState("")
  const [body, setBody] = useState("")
  const [insightType, setInsightType] = useState<(typeof INSIGHT_TYPES)[number]>("delivery")
  const [period, setPeriod] = useState(defaultPeriod ?? "")
  const [action, setAction] = useState("")
  const [actionOwner, setActionOwner] = useState("")
  const [outcome, setOutcome] = useState("")
  const [outcomeKind, setOutcomeKind] = useState<"" | InsightOutcomeKind>("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const scopeClientId = lockedScope ? clientId : pickedClientId ? Number(pickedClientId) : null
  const scopeMba = lockedScope ? mbaNumber : pickedMba || null
  const canSubmit =
    body.trim().length > 0 &&
    (scopeClientId != null || (scopeMba != null && scopeMba.trim() !== ""))

  function reset() {
    setBody("")
    setInsightType("delivery")
    setPeriod(defaultPeriod ?? "")
    setAction("")
    setActionOwner("")
    setOutcome("")
    setOutcomeKind("")
    setPickedClientId("")
    setPickedMba("")
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
          body: JSON.stringify(
            buildInsightCreatePayload({
              clientId: scopeClientId,
              mbaNumber: scopeMba,
              body,
              insightType,
              period,
              action,
              actionOwner,
              outcome,
              outcomeKind: outcomeKind || null,
            }),
          ),
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

      {!lockedScope ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <InsightScopePickers
            clientId={pickedClientId}
            mbaNumber={pickedMba}
            onClientId={(id) => {
              setPickedClientId(id ?? "")
              setPickedMba("")
            }}
            onMbaNumber={(mba) => setPickedMba(mba ?? "")}
          />
        </div>
      ) : null}

      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <select
            className={selectClass}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Action (optional)</span>
          <Textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="The next step"
            rows={2}
            className="resize-y"
            maxLength={2000}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Owner (optional)</span>
          <Input
            value={actionOwner}
            onChange={(e) => setActionOwner(e.target.value)}
            placeholder="Who owns it"
            maxLength={200}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Outcome kind (optional)</span>
          <select
            className={selectClass}
            value={outcomeKind}
            aria-label="Outcome kind"
            onChange={(e) => setOutcomeKind(e.target.value as "" | InsightOutcomeKind)}
          >
            <option value="">Not set</option>
            {INSIGHT_OUTCOME_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Outcome (optional)</span>
          <Textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What changed, or what will be measured"
            rows={2}
            className="resize-y"
            maxLength={2000}
          />
        </label>
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
