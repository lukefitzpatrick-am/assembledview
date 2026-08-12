"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Lightbulb, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { QuickAddInsightForm } from "@/components/insights/QuickAddInsightForm"
import { cn } from "@/lib/utils"

type InsightRow = {
  id: number
  mbaNumber: string
  clientId: number
  period: string | null
  insightType: string
  body: string
  source: string
  confidence: string | null
  createdBy: string
  createdAt: string
  supersededBy: number | null
  supersededAt: string | null
  superseded?: InsightRow[]
}

const INSIGHT_TYPES = ["delivery", "audience", "creative", "channel", "commercial"] as const
const SOURCES = ["ava", "human"] as const

function param(sp: URLSearchParams, key: string): string {
  return sp.get(key)?.trim() ?? ""
}

export function InsightsPageClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const q = param(searchParams, "q")
  const clientId = param(searchParams, "clientId")
  const mba = param(searchParams, "mba")
  const period = param(searchParams, "period")
  const insightType = param(searchParams, "insightType")
  const source = param(searchParams, "source")
  const showSuperseded =
    searchParams.get("showSuperseded") === "1" ||
    searchParams.get("showSuperseded") === "true"

  const [draftQ, setDraftQ] = useState(q)
  const [items, setItems] = useState<InsightRow[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraftQ(q)
  }, [q])

  const apiUrl = useMemo(() => {
    const sp = new URLSearchParams()
    if (q) sp.set("q", q)
    if (clientId) sp.set("clientId", clientId)
    if (mba) sp.set("mba", mba)
    if (period) sp.set("period", period)
    if (insightType) sp.set("insightType", insightType)
    if (source) sp.set("source", source)
    if (showSuperseded) sp.set("showSuperseded", "1")
    sp.set("limit", "50")
    return `/api/insights?${sp.toString()}`
  }, [q, clientId, mba, period, insightType, source, showSuperseded])

  const reload = useCallback(() => {
    setError(null)
    setItems(null)
    void fetch(apiUrl, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setForbidden(true)
          return
        }
        if (!res.ok) {
          setError("Failed to load insights.")
          return
        }
        const data = (await res.json()) as { items?: InsightRow[] }
        setItems(Array.isArray(data.items) ? data.items : [])
      })
      .catch(() => setError("Failed to load insights."))
  }, [apiUrl])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setItems(null)
    ;(async () => {
      try {
        const res = await fetch(apiUrl, { cache: "no-store" })
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setForbidden(true)
          return
        }
        if (!res.ok) {
          if (!cancelled) setError("Failed to load insights.")
          return
        }
        const data = (await res.json()) as { items?: InsightRow[] }
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : [])
      } catch {
        if (!cancelled) setError("Failed to load insights.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiUrl])

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") sp.delete(k)
        else sp.set(k, v)
      }
      const qs = sp.toString()
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname)
      })
    },
    [pathname, router, searchParams],
  )

  if (forbidden) {
    return (
      <ErrorState
        title="Forbidden"
        message="Insights are internal. Your account cannot access this library."
      />
    )
  }

  return (
    <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-6 md:px-6 md:pt-8">
      <div className="space-y-2">
        <h1 className="inline-flex flex-wrap items-center gap-2 text-[26px] font-extrabold tracking-tight text-foreground">
          <Lightbulb className="h-6 w-6 text-muted-foreground" aria-hidden strokeWidth={1.8} />
          Insights
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Searchable record of what AVA and the team learned about campaigns. Internal only.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-e1"
        onSubmit={(e) => {
          e.preventDefault()
          replaceParams({ q: draftQ.trim() || null })
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Search body</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
                strokeWidth={1.8}
              />
              <Input
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                placeholder="Full-text search…"
                className="pl-9"
              />
            </div>
          </label>
          <Button type="submit" disabled={pending}>
            Search
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Client ID</span>
            <Input
              value={clientId}
              onChange={(e) => replaceParams({ clientId: e.target.value.trim() || null })}
              inputMode="numeric"
              placeholder="e.g. 42"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">MBA</span>
            <Input
              value={mba}
              onChange={(e) => replaceParams({ mba: e.target.value.trim().toLowerCase() || null })}
              placeholder="mba number"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Period</span>
            <Input
              value={period}
              onChange={(e) => replaceParams({ period: e.target.value.trim() || null })}
              placeholder="YYYY-MM"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Type</span>
            <select
              className="flex h-10 w-full rounded-input border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={insightType}
              onChange={(e) => replaceParams({ insightType: e.target.value || null })}
            >
              <option value="">All types</option>
              {INSIGHT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Source</span>
            <select
              className="flex h-10 w-full rounded-input border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={source}
              onChange={(e) => replaceParams({ source: e.target.value || null })}
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Switch
            checked={showSuperseded}
            onCheckedChange={(checked) =>
              replaceParams({ showSuperseded: checked ? "1" : null })
            }
            aria-label="Show superseded insights"
          />
          <span className="text-sm text-muted-foreground">Show superseded</span>
        </div>
      </form>

      <QuickAddInsightForm
        clientId={clientId && /^\d+$/.test(clientId) ? Number(clientId) : null}
        mbaNumber={mba || null}
        defaultPeriod={period || null}
        onCreated={reload}
      />

      {items == null && !error ? <LoadingState /> : null}
      {error ? <ErrorState title="Could not load" message={error} /> : null}

      {items && items.length === 0 ? (
        <EmptyState
          title="No insights match"
          message="Try clearing filters or generating a performance report to seed the library."
        />
      ) : null}

      {items && items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "rounded-card border border-border bg-card p-4 shadow-e0",
                item.supersededBy != null && "opacity-80",
              )}
            >
              <InsightCard item={item} onUpdated={reload} />
              {showSuperseded && item.superseded && item.superseded.length > 0 ? (
                <ul className="mt-3 space-y-2 border-l-2 border-border pl-3">
                  {item.superseded.map((child) => (
                    <li key={child.id} className="rounded-input bg-surface-panel p-3">
                      <div className="mb-1">
                        <Badge variant="attention" size="sm">
                          superseded
                        </Badge>
                      </div>
                      <InsightCard item={child} compact />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function InsightCard({
  item,
  compact,
  onUpdated,
}: {
  item: InsightRow
  compact?: boolean
  onUpdated?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.body)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const live = item.supersededBy == null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" size="sm">
          {item.insightType}
        </Badge>
        <Badge variant="outline" size="sm">
          {item.source}
        </Badge>
        {item.period ? (
          <span className="num text-[11px] text-muted-foreground">{item.period}</span>
        ) : null}
        <Link
          href={`/insights?mba=${encodeURIComponent(item.mbaNumber)}`}
          className="text-[11px] uppercase tracking-wide text-primary hover:underline"
        >
          {item.mbaNumber}
        </Link>
        {item.supersededBy != null ? (
          <Badge variant="attention" size="sm">
            superseded
          </Badge>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="flex min-h-[72px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
          />
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || !draft.trim()}
              onClick={() => {
                setErr(null)
                startTransition(async () => {
                  try {
                    const res = await fetch(`/api/insights/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ body: draft.trim() }),
                    })
                    if (!res.ok) {
                      const data = (await res.json().catch(() => null)) as {
                        message?: string
                      } | null
                      setErr(data?.message || "Could not update.")
                      return
                    }
                    setEditing(false)
                    onUpdated?.()
                  } catch {
                    setErr("Could not update.")
                  }
                })
              }}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setErr(null)
                startTransition(async () => {
                  try {
                    const res = await fetch(`/api/insights/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ body: draft.trim(), mode: "supersede" }),
                    })
                    if (!res.ok) {
                      const data = (await res.json().catch(() => null)) as {
                        message?: string
                      } | null
                      setErr(data?.message || "Could not supersede.")
                      return
                    }
                    setEditing(false)
                    onUpdated?.()
                  } catch {
                    setErr("Could not supersede.")
                  }
                })
              }}
            >
              Supersede
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(item.body)
                setEditing(false)
                setErr(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn("text-sm text-foreground", compact ? "line-clamp-3" : "")}>{item.body}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground">
          <span className="num">{item.createdAt.slice(0, 10)}</span>
          {" · "}
          {item.createdBy}
          {item.confidence ? ` · ${item.confidence}` : ""}
        </p>
        {live && !compact && !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setDraft(item.body)
              setEditing(true)
            }}
          >
            Edit
          </Button>
        ) : null}
      </div>
    </div>
  )
}
