"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { formatMoney } from "@/lib/format/money"
import type { ChannelTabKey } from "@/lib/pacing/channel/lineCardTypes"
import { cardChannelFromPlanLine, cardChannelFromWarehouse } from "@/lib/pacing/relabel/shared/channels"
import type {
  MatchClientOption,
  MatchEntity,
  MatchEntityStatus,
  MatchPayload,
  MatchPlanLine,
  MatchSuggestion,
} from "@/lib/pacing/relabel/match/types"
import type { RelabelPreview } from "@/lib/pacing/relabel/shared/types"

const DISMISSED_KEY = "av.relabels.match.dismissed"

const CHANNEL_CHIPS: { key: ChannelTabKey; label: string }[] = [
  { key: "programmatic", label: "Programmatic" },
  { key: "social", label: "Social" },
  { key: "search", label: "Search" },
  { key: "ad-serving", label: "Ad serving" },
  { key: "direct", label: "Direct" },
]

const STATUS_LABEL: Record<MatchEntityStatus, string> = {
  matched: "Matched",
  not_on_plan: "Not on plan",
  no_plan_id: "No plan id",
  duplicate: "Duplicate",
  check_dates: "Check dates",
}

const STATUS_VARIANT: Record<MatchEntityStatus, "success" | "warning" | "secondary" | "danger" | "info"> = {
  matched: "success",
  not_on_plan: "warning",
  no_plan_id: "danger",
  duplicate: "secondary",
  check_dates: "info",
}

const KIND_LABEL: Record<MatchSuggestion["kind"], string> = {
  high: "High",
  check: "Check",
  duplicate: "Duplicate",
}

type EntityPreview = { entity: MatchEntity; preview: RelabelPreview | null; error: string | null }

function money(value: number): string {
  return formatMoney(value, { decimals: 0 })
}

function shortDate(ymd: string | null): string {
  if (!ymd) return "—"
  try {
    return format(parseISO(ymd), "d MMM yy")
  } catch {
    return ymd
  }
}

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
  } catch {
    // Private window or blocked storage: dismissals last for this visit only.
  }
}

/** Keep ?tab=match&client=&mba= in the address bar without a navigation. */
function syncUrl(clientId: string, mba: string): void {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set("tab", "match")
    if (clientId) url.searchParams.set("client", clientId)
    else url.searchParams.delete("client")
    if (mba) url.searchParams.set("mba", mba)
    else url.searchParams.delete("mba")
    window.history.replaceState(null, "", url.toString())
  } catch {
    // Non-browser test environment.
  }
}

export function RelabelMatchTab({
  initialClient,
  initialMba,
  onApplied,
}: {
  initialClient?: string
  initialMba?: string
  onApplied?: () => void
}) {
  const { toast } = useToast()
  const [clients, setClients] = useState<MatchClientOption[] | null>(null)
  const [clientId, setClientId] = useState(initialClient ?? "")
  const [mba, setMba] = useState((initialMba ?? "").toLowerCase())
  const [payload, setPayload] = useState<MatchPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chips, setChips] = useState<Set<ChannelTabKey>>(new Set())
  const [unmatchedOnly, setUnmatchedOnly] = useState(true)
  const [entitySearch, setEntitySearch] = useState("")
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetLine, setTargetLine] = useState("")
  const [scope, setScope] = useState<"all" | "range">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [reason, setReason] = useState("")
  const [previews, setPreviews] = useState<EntityPreview[] | null>(null)
  const [busy, setBusy] = useState<"preview" | "apply" | "request" | null>(null)
  const [ackWarnings, setAckWarnings] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed())
  }, [])

  const load = useCallback(
    async (opts: { fresh?: boolean } = {}) => {
      const params = new URLSearchParams()
      if (clientId) params.set("client", clientId)
      else if (mba) params.set("mba", mba)
      if (opts.fresh) params.set("fresh", "1")
      const hasClient = params.has("client") || params.has("mba")
      if (hasClient) setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/pacing/relabels/match?${params.toString()}`, { credentials: "include" })
        const json = (await r.json().catch(() => null)) as
          | { clients?: MatchClientOption[]; payload?: MatchPayload; error?: string }
          | null
        if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
        setClients(json?.clients ?? [])
        setPayload(json?.payload ?? null)
        if (json?.payload && !clientId) setClientId(String(json.payload.client.id))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setClients((prev) => prev ?? [])
      } finally {
        setLoading(false)
      }
    },
    [clientId, mba],
  )

  useEffect(() => {
    void load()
    // Reload only when the client changes; the campaign filter is client-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    syncUrl(clientId, mba)
  }, [clientId, mba])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setTargetLine("")
    setPreviews(null)
    setAckWarnings(false)
  }, [])

  const chooseClient = (value: string) => {
    setClientId(value)
    setMba("")
    setPayload(null)
    clearSelection()
  }

  const entityByKey = useMemo(() => new Map((payload?.entities ?? []).map((e) => [e.key, e])), [payload])
  const lineById = useMemo(() => new Map((payload?.lines ?? []).map((l) => [l.lineItemId, l])), [payload])

  const inCampaign = useCallback(
    (entityOrLine: { mbaNumber: string | null }) => !mba || entityOrLine.mbaNumber === mba || entityOrLine.mbaNumber == null,
    [mba],
  )

  const visibleEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase()
    return (payload?.entities ?? []).filter((e) => {
      if (!inCampaign(e)) return false
      if (mba && e.mbaNumber == null && e.status !== "no_plan_id") return false
      if (unmatchedOnly && e.status === "matched") return false
      if (chips.size > 0 && !chips.has(cardChannelFromWarehouse(e.channel))) return false
      if (q && !`${e.name} ${e.lineItemId} ${e.campaignName} ${e.platformEntityId}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [payload, inCampaign, mba, unmatchedOnly, chips, entitySearch])

  const visibleLines = useMemo(
    () =>
      (payload?.lines ?? []).filter((l) => {
        if (mba && l.mbaNumber !== mba) return false
        if (chips.size > 0 && !chips.has(cardChannelFromPlanLine(l.lineChannel))) return false
        return true
      }),
    [payload, mba, chips],
  )

  const visibleSuggestions = useMemo(
    () =>
      (payload?.suggestions ?? []).filter((s) => {
        if (dismissed.has(s.id)) return false
        const entities = s.entityKeys.map((k) => entityByKey.get(k)).filter(Boolean) as MatchEntity[]
        if (mba && !entities.some((e) => e.mbaNumber === mba)) return false
        if (chips.size > 0 && !entities.some((e) => chips.has(cardChannelFromWarehouse(e.channel)))) return false
        return true
      }),
    [payload, dismissed, entityByKey, mba, chips],
  )

  const dismiss = (id: string) => {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    writeDismissed(next)
  }

  const toggleEntity = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
    setPreviews(null)
    setAckWarnings(false)
  }

  const toggleChip = (key: ChannelTabKey) => {
    const next = new Set(chips)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChips(next)
  }

  const selectedEntities = useMemo(
    () => [...selected].map((k) => entityByKey.get(k)).filter(Boolean) as MatchEntity[],
    [selected, entityByKey],
  )
  const selectedSpend = selectedEntities.reduce((sum, e) => sum + e.spend, 0)
  const target: MatchPlanLine | null = targetLine ? lineById.get(targetLine) ?? null : null

  const scopeBody = () => ({
    dateFrom: scope === "range" && dateFrom ? dateFrom : null,
    dateTo: scope === "range" && dateTo ? dateTo : null,
  })

  const runPreview = useCallback(
    async (entities: MatchEntity[], lineItemId: string) => {
      if (entities.length === 0 || !lineItemId) return
      setBusy("preview")
      setAckWarnings(false)
      const out: EntityPreview[] = []
      for (const entity of entities) {
        try {
          const r = await fetch("/api/pacing/relabels/preview", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              channel: entity.channel,
              platformEntityId: entity.platformEntityId,
              lineItemId,
              ...scopeBody(),
            }),
          })
          const json = (await r.json().catch(() => null)) as { preview?: RelabelPreview; message?: string; error?: string } | null
          if (!r.ok || !json?.preview) throw new Error(json?.message || json?.error || `HTTP ${r.status}`)
          out.push({ entity, preview: json.preview, error: null })
        } catch (e) {
          out.push({ entity, preview: null, error: e instanceof Error ? e.message : String(e) })
        }
      }
      setPreviews(out)
      setBusy(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, dateFrom, dateTo],
  )

  const preselect = (s: MatchSuggestion, thenPreview: boolean) => {
    const keys = new Set(s.entityKeys)
    setSelected(keys)
    const line = s.targetLineIds.length === 1 ? s.targetLineIds[0]! : ""
    setTargetLine(line)
    setPreviews(null)
    setAckWarnings(false)
    if (thenPreview && line) {
      const entities = s.entityKeys.map((k) => entityByKey.get(k)).filter(Boolean) as MatchEntity[]
      void runPreview(entities, line)
    }
  }

  const ready = (previews ?? []).filter((p) => p.preview && p.preview.blocks.length === 0 && p.preview.state !== "no_change")
  const blocked = (previews ?? []).filter((p) => p.preview && p.preview.blocks.length > 0)
  const failed = (previews ?? []).filter((p) => p.error)
  const noChange = (previews ?? []).filter((p) => p.preview?.state === "no_change")
  const warnings = ready.flatMap((p) => p.preview!.warnings)
  const spendMoving = ready.reduce((sum, p) => sum + (p.preview?.spendMoving ?? 0), 0)
  const reasonOk = reason.trim().length >= 3

  const runApply = async (saveAsRequest: boolean) => {
    const rows = saveAsRequest ? blocked : ready
    if (rows.length === 0 || !reasonOk || !targetLine) return
    if (!saveAsRequest && warnings.length > 0 && !ackWarnings) {
      setAckWarnings(true)
      return
    }
    setBusy(saveAsRequest ? "request" : "apply")
    let ok = 0
    const errors: string[] = []
    for (const row of rows) {
      try {
        const r = await fetch("/api/pacing/relabels/apply", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            channel: row.entity.channel,
            platformEntityId: row.entity.platformEntityId,
            lineItemId: targetLine,
            ...scopeBody(),
            reason: reason.trim(),
            acknowledgeWarnings: true,
            saveAsRequest,
          }),
        })
        const json = (await r.json().catch(() => null)) as { message?: string; error?: string } | null
        if (!r.ok && !(saveAsRequest && r.status === 409)) throw new Error(json?.message || json?.error || `HTTP ${r.status}`)
        ok += 1
      } catch (e) {
        errors.push(`${row.entity.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setBusy(null)
    toast({
      variant: errors.length ? "destructive" : undefined,
      title: saveAsRequest ? `${ok} request${ok === 1 ? "" : "s"} saved for Luke` : `${ok} relabel${ok === 1 ? "" : "s"} applied`,
      description: errors.length ? errors.join(" · ") : undefined,
    })
    if (ok > 0) {
      clearSelection()
      setReason("")
      onApplied?.()
      void load({ fresh: true })
    }
  }

  const summary = payload?.summary

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-e1 md:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="match-client">
            Client
          </label>
          <select
            id="match-client"
            className="h-10 w-full rounded-input border border-border bg-background px-3 text-sm"
            value={clientId}
            onChange={(e) => chooseClient(e.target.value)}
          >
            <option value="">Select a client</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.campaignCount} live)
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="match-campaign">
            Campaign
          </label>
          <select
            id="match-campaign"
            className="h-10 w-full rounded-input border border-border bg-background px-3 text-sm"
            value={mba}
            disabled={!payload}
            onChange={(e) => {
              setMba(e.target.value)
              clearSelection()
            }}
          >
            <option value="">All campaigns</option>
            {(payload?.campaigns ?? []).map((c) => (
              <option key={c.mbaNumber} value={c.mbaNumber}>
                {c.mbaNumber.toUpperCase()} · {c.campaignName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" disabled={!clientId || loading} onClick={() => void load({ fresh: true })}>
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-3">
          {CHANNEL_CHIPS.map((chip) => (
            <Button
              key={chip.key}
              size="sm"
              variant={chips.has(chip.key) ? "default" : "outline"}
              aria-pressed={chips.has(chip.key)}
              onClick={() => toggleChip(chip.key)}
            >
              {chip.label}
            </Button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} />
            Show unmatched only
          </label>
        </div>
      </div>

      {error ? <ErrorState title="Could not load match data" message={error} /> : null}
      {!clientId && !error ? (
        <EmptyState title="Pick a client" message="Match shows that client's warehouse delivery next to its published plan lines." />
      ) : null}
      {loading ? <LoadingState rows={6} /> : null}

      {payload && !loading ? (
        <>
          <p className="text-xs text-muted-foreground">
            Delivery since {shortDate(payload.since)}. Legacy social rows in PACING_FACT are left out because they duplicate the social fact.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Unmatched delivery" value={money(summary?.unmatchedSpend ?? 0)} note={`${summary?.unmatchedCount ?? 0} entities`} />
            <Tile label="Plan lines with no delivery" value={String(summary?.linesWithoutDelivery ?? 0)} />
            <Tile label="Suggestions ready" value={String(visibleSuggestions.length)} />
            <Tile label="Lines to check" value={String(summary?.checkDatesCount ?? 0)} note="Delivery outside line dates" />
          </div>

          <section className="space-y-2" aria-label="Suggested matches">
            <h3 className="text-sm font-semibold">Suggested matches</h3>
            {visibleSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions for this view.</p>
            ) : (
              <ul className="space-y-2">
                {visibleSuggestions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3">
                    <Badge variant={s.kind === "high" ? "success" : s.kind === "check" ? "warning" : "secondary"}>
                      {KIND_LABEL[s.kind]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {s.entityKeys.length} entit{s.entityKeys.length === 1 ? "y" : "ies"}
                        {s.targetLineIds.length ? ` → ${s.targetLineIds.map((id) => id.toUpperCase()).join(" or ")}` : ""}
                        <span className="num ml-2 font-semibold">{money(s.spend)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                    {s.kind === "duplicate" ? (
                      <Button size="sm" variant="outline" onClick={() => dismiss(s.id)}>
                        Ignore
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" disabled={s.targetLineIds.length !== 1 || busy != null} onClick={() => preselect(s, true)}>
                          Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => preselect(s, false)}>
                          Review
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismiss(s.id)}>
                          Dismiss
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2 rounded-card border border-border bg-card p-4 shadow-e1" aria-label="In the warehouse">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">In the warehouse</h3>
                <span className="text-xs text-muted-foreground">{visibleEntities.length} shown</span>
              </div>
              <Input placeholder="Search name, id or campaign" value={entitySearch} onChange={(e) => setEntitySearch(e.target.value)} />
              <div className="max-h-[520px] space-y-1 overflow-y-auto">
                {visibleEntities.map((e) => (
                  <label
                    key={e.key}
                    className="flex cursor-pointer items-start gap-2 rounded-input border border-transparent p-2 hover:border-border"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(e.key)}
                      disabled={e.status === "duplicate"}
                      onChange={() => toggleEntity(e.key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" title={e.name}>
                        {e.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {e.channel} · {e.status === "no_plan_id" ? "no plan id" : e.lineItemId.toUpperCase()} · {shortDate(e.firstDate)} to {shortDate(e.lastDate)}
                      </span>
                    </span>
                    <span className="num text-sm font-semibold">{money(e.spend)}</span>
                    <Badge size="sm" variant={STATUS_VARIANT[e.status]}>
                      {STATUS_LABEL[e.status]}
                    </Badge>
                  </label>
                ))}
                {visibleEntities.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to show.</p> : null}
              </div>
            </section>

            <section className="space-y-2 rounded-card border border-border bg-card p-4 shadow-e1" aria-label="On the plan">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">On the plan</h3>
                <span className="text-xs text-muted-foreground">{visibleLines.length} published lines</span>
              </div>
              <div className="max-h-[560px] space-y-1 overflow-y-auto">
                {visibleLines.map((l) => (
                  <label
                    key={l.lineItemId}
                    className="flex cursor-pointer items-start gap-2 rounded-input border border-transparent p-2 hover:border-border"
                  >
                    <input
                      type="radio"
                      name="match-target-line"
                      className="mt-1"
                      checked={targetLine === l.lineItemId}
                      onChange={() => {
                        setTargetLine(l.lineItemId)
                        setPreviews(null)
                        setAckWarnings(false)
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{l.lineItemId.toUpperCase()}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[l.platform, l.buyType].filter(Boolean).join(" · ") || l.lineChannel} · {shortDate(l.startDate)} to {shortDate(l.endDate)}
                      </span>
                    </span>
                    <span className="num text-sm font-semibold">{money(l.delivered)}</span>
                    <Badge size="sm" variant={l.entityCount > 0 ? "success" : "warning"}>
                      {l.entityCount > 0 ? `${l.entityCount} delivering` : "No delivery"}
                    </Badge>
                  </label>
                ))}
                {visibleLines.length === 0 ? <p className="text-sm text-muted-foreground">No published lines in this view.</p> : null}
              </div>
            </section>
          </div>

          {selected.size > 0 || targetLine ? (
            <div className="sticky bottom-2 z-10 space-y-3 rounded-card border border-border bg-card p-4 shadow-e2" aria-label="Relabel preview">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  <span className="font-semibold">{selected.size}</span> selected ·{" "}
                  <span className="num font-semibold">{money(selectedSpend)}</span>
                </span>
                <span>→ {target ? target.lineItemId.toUpperCase() : "pick a plan line"}</span>
                <select
                  aria-label="Scope"
                  className="h-9 rounded-input border border-border bg-background px-2 text-sm"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value === "range" ? "range" : "all")
                    setPreviews(null)
                  }}
                >
                  <option value="all">All history</option>
                  <option value="range">Date range</option>
                </select>
                {scope === "range" ? (
                  <>
                    <Input type="date" aria-label="From" className="h-9 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    <Input type="date" aria-label="To" className="h-9 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!target || selected.size === 0 || busy != null}
                  onClick={() => void runPreview(selectedEntities, targetLine)}
                >
                  {busy === "preview" ? "Previewing…" : "Preview"}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
              </div>

              {previews ? (
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="num font-semibold">{money(spendMoving)}</span> moves on {ready.length} entit
                    {ready.length === 1 ? "y" : "ies"}
                    {target ? ` (line has ${money(target.delivered)} now, ${money(target.delivered + spendMoving)} after)` : ""}.
                  </p>
                  {noChange.length ? <p className="text-muted-foreground">{noChange.length} already on this line.</p> : null}
                  {blocked.length ? (
                    <p className="text-destructive">
                      {blocked.length} blocked: {blocked.map((b) => b.preview!.blocks.map((x) => x.message).join("; ")).join(" · ")}
                    </p>
                  ) : null}
                  {failed.length ? <p className="text-destructive">{failed.length} failed: {failed.map((f) => f.error).join(" · ")}</p> : null}
                  {warnings.length ? (
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {warnings.map((w, i) => (
                        <li key={`${w.code}-${i}`}>{w.message}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Input
                      aria-label="Reason"
                      placeholder="Reason (required)"
                      className="h-9 max-w-md"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button size="sm" disabled={!reasonOk || ready.length === 0 || busy != null} onClick={() => void runApply(false)}>
                      {busy === "apply" ? "Applying…" : ackWarnings ? "Confirm apply" : "Apply"}
                    </Button>
                    {blocked.length ? (
                      <Button size="sm" variant="outline" disabled={!reasonOk || busy != null} onClick={() => void runApply(true)}>
                        Save blocked as requests for Luke
                      </Button>
                    ) : null}
                  </div>
                  {ackWarnings ? <p className="text-xs">Read the warnings above, then press Confirm apply.</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-e1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num text-xl font-semibold">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}
