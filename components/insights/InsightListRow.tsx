"use client"

import Link from "next/link"
import { useEffect, useState, useTransition, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const INSIGHT_TYPES = ["delivery", "audience", "creative", "channel", "commercial"] as const

export type InsightListItem = {
  id: number
  mbaNumber: string
  clientId: number
  clientName?: string | null
  clientSlug?: string | null
  period: string | null
  insightType: string
  body: string
  source: string
  confidence: string | null
  createdBy: string
  createdAt: string
  supersededBy: number | null
  supersededAt: string | null
  superseded?: InsightListItem[]
}

export type InsightDetailPayload = {
  item: InsightListItem
  replaced: InsightListItem[]
  replacedBy: InsightListItem | null
}

export type InsightWriteResult = {
  item: InsightListItem
  mode: string
  chain: InsightDetailPayload
}

function campaignHref(item: Pick<InsightListItem, "mbaNumber" | "clientSlug">): string | null {
  const slug = item.clientSlug?.trim()
  if (!slug) return null
  return `/dashboard/${encodeURIComponent(slug)}/${encodeURIComponent(item.mbaNumber)}`
}

function previewLines(body: string, maxLines = 2): string {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return body.trim()
  return lines.slice(0, maxLines).join("\n")
}

const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-base font-semibold text-foreground">{children}</h3>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h4 className="mt-3 text-sm font-semibold text-foreground">{children}</h4>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h5 className="mt-2 text-sm font-medium text-foreground">{children}</h5>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="leading-relaxed text-foreground">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc space-y-1 pl-5 text-foreground">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal space-y-1 pl-5 text-foreground">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="text-muted-foreground">{children}</em>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-input bg-muted px-1 py-0.5 text-xs">{children}</code>
  ),
}

type Props = {
  item: InsightListItem
  compact?: boolean
  onUpdated?: (result?: InsightWriteResult) => void
}

export function InsightListRow({ item, compact, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<InsightDetailPayload | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [retyping, setRetyping] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const [draft, setDraft] = useState(item.body)
  const [retypeType, setRetypeType] = useState(item.insightType)
  const [retireReason, setRetireReason] = useState("")
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const live = item.supersededBy == null
  const href = campaignHref(item)
  const preview = previewLines(item.body, 2)

  useEffect(() => {
    if (!open || detail) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/insights/${item.id}`, { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) setDetailError("Could not load detail.")
          return
        }
        const data = (await res.json()) as InsightDetailPayload
        if (!cancelled) setDetail(data)
      } catch {
        if (!cancelled) setDetailError("Could not load detail.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, detail, item.id])

  function applyWrite(res: Response, failLabel: string) {
    return res.json().then((data: InsightWriteResult & { message?: string }) => {
      if (!res.ok) {
        setErr(data?.message || failLabel)
        return
      }
      if (data.chain) setDetail(data.chain)
      setEditing(false)
      setRetyping(false)
      setRetiring(false)
      onUpdated?.(
        data.item && data.mode && data.chain
          ? { item: data.item, mode: data.mode, chain: data.chain }
          : undefined,
      )
    })
  }

  return (
    <div>
      <button
        type="button"
        className="interactive flex w-full items-start gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" size="sm">
              {item.insightType}
            </Badge>
            <Badge variant="outline" size="sm">
              {item.source}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {item.clientName || `Client #${item.clientId}`}
            </span>
            {href ? (
              <Link
                href={href}
                className="text-[11px] uppercase tracking-wide text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {item.mbaNumber}
              </Link>
            ) : (
              <Link
                href={`/insights?mba=${encodeURIComponent(item.mbaNumber)}`}
                className="text-[11px] uppercase tracking-wide text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {item.mbaNumber}
              </Link>
            )}
            {item.period ? (
              <span className="num text-[11px] text-muted-foreground">{item.period}</span>
            ) : null}
            {item.supersededBy != null ? (
              <Badge variant="attention" size="sm">
                superseded
              </Badge>
            ) : null}
          </div>
          {!open ? (
            <p className={cn("whitespace-pre-wrap text-sm text-foreground", compact && "line-clamp-3")}>
              {preview}
              {item.body.trim() !== preview.trim() ? (
                <span className="text-muted-foreground"> …</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {editing ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Edit creates a new human row and supersedes this one — history is never mutated.
              </p>
              <textarea
                className="flex min-h-[96px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                          body: JSON.stringify({ body: draft.trim(), mode: "supersede" }),
                        })
                        await applyWrite(res, "Could not supersede.")
                      } catch {
                        setErr("Could not supersede.")
                      }
                    })
                  }}
                >
                  {pending ? "Saving…" : "Save (supersede)"}
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
          ) : null}

          {retyping ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Retype updates insight_type in place and clears the fallback confidence tag.
              </p>
              <select
                className="flex h-10 w-full max-w-xs rounded-input border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={retypeType}
                onChange={(e) => setRetypeType(e.target.value)}
              >
                {INSIGHT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || retypeType === item.insightType}
                  onClick={() => {
                    setErr(null)
                    startTransition(async () => {
                      try {
                        const res = await fetch(`/api/insights/${item.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode: "retype", insightType: retypeType }),
                        })
                        await applyWrite(res, "Could not retype.")
                      } catch {
                        setErr("Could not retype.")
                      }
                    })
                  }}
                >
                  {pending ? "Saving…" : "Retype"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRetypeType(item.insightType)
                    setRetyping(false)
                    setErr(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {retiring ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Retire supersedes with a minimal human row — no hard delete.
              </p>
              <Input
                value={retireReason}
                onChange={(e) => setRetireReason(e.target.value)}
                placeholder="Reason this is no longer true"
              />
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || !retireReason.trim()}
                  onClick={() => {
                    setErr(null)
                    startTransition(async () => {
                      try {
                        const res = await fetch(`/api/insights/${item.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode: "retire", reason: retireReason.trim() }),
                        })
                        await applyWrite(res, "Could not retire.")
                      } catch {
                        setErr("Could not retire.")
                      }
                    })
                  }}
                >
                  {pending ? "Saving…" : "Retire"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRetireReason("")
                    setRetiring(false)
                    setErr(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {!editing && !retyping && !retiring ? (
            <div className="space-y-3 text-sm text-foreground">
              <ReactMarkdown components={markdownComponents}>{item.body}</ReactMarkdown>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              <span className="num">{item.createdAt.slice(0, 10)}</span>
              {" · "}
              {item.createdBy}
              {item.confidence ? (
                <>
                  {" · "}
                  <Badge variant="outline" size="sm">
                    {item.confidence}
                  </Badge>
                </>
              ) : null}
            </span>
            {href ? (
              <Link href={href} className="text-primary hover:underline">
                Open campaign →
              </Link>
            ) : null}
            {live && !compact && !editing && !retyping && !retiring ? (
              <>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setRetypeType(item.insightType)
                    setRetyping(true)
                  }}
                >
                  Retype
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setRetiring(true)}
                >
                  Retire
                </Button>
              </>
            ) : null}
          </div>

          {detailError ? (
            <p className="text-xs text-muted-foreground">{detailError}</p>
          ) : null}
          {detail ? (
            <div className="space-y-2 rounded-input bg-surface-panel p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Supersede chain</p>
              {detail.replacedBy ? (
                <p>
                  Replaced by{" "}
                  <Link
                    href={`/insights?mba=${encodeURIComponent(detail.replacedBy.mbaNumber)}`}
                    className="text-primary hover:underline"
                  >
                    #{detail.replacedBy.id}
                  </Link>{" "}
                  ({detail.replacedBy.createdAt.slice(0, 10)})
                </p>
              ) : (
                <p>Not superseded — this is current.</p>
              )}
              {detail.replaced.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4">
                  {detail.replaced.map((r) => (
                    <li key={r.id}>
                      Superseded #{r.id} · {r.createdAt.slice(0, 10)} ·{" "}
                      <span className="line-clamp-1">{previewLines(r.body, 1)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Did not replace a prior insight.</p>
              )}
            </div>
          ) : open && !detailError ? (
            <p className="text-xs text-muted-foreground">Loading chain…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
