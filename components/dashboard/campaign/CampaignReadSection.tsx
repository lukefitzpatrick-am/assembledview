"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { format, isValid, parseISO } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  CAMPAIGN_READ_BEAT_KEYS,
  CAMPAIGN_READ_HEADINGS,
  type CampaignRead,
  type CampaignReadBeatKey,
  type CampaignReadBeats,
  type CampaignReadListPayload,
} from "@/lib/campaign-read/types"

type Props = {
  mbaNumber: string
  versionNumber: number
  clientSlug?: string
  isAdmin: boolean
  regenerateToken?: number
}

function formatReadAsAt(iso: string | null | undefined): string {
  if (!iso) return "—"
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return "—"
  return format(parsed, "d MMM yyyy")
}

function BeatBlock({
  beatKey,
  text,
  editing,
  draft,
  onChange,
}: {
  beatKey: CampaignReadBeatKey
  text: string
  editing: boolean
  draft: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">
        {CAMPAIGN_READ_HEADINGS[beatKey]}
      </h3>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={800}
          className="resize-y"
        />
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {text}
        </p>
      )}
    </div>
  )
}

export function CampaignReadBeatsView({
  beats,
  readAsAt,
}: {
  beats: CampaignReadBeats
  readAsAt: string
}) {
  return (
    <>
      <p className="text-xs text-muted-foreground">Read as at {readAsAt}</p>
      {CAMPAIGN_READ_BEAT_KEYS.map((key) => (
        <BeatBlock
          key={key}
          beatKey={key}
          text={beats[key]}
          editing={false}
          draft=""
          onChange={() => {}}
        />
      ))}
    </>
  )
}

export function CampaignReadSection({
  mbaNumber,
  versionNumber,
  clientSlug,
  isAdmin,
  regenerateToken = 0,
}: Props) {
  const [payload, setPayload] = useState<CampaignReadListPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftBeats, setDraftBeats] = useState<CampaignReadBeats | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const lastRegen = useRef(0)
  const rootRef = useRef<HTMLElement | null>(null)

  const visible: CampaignRead | null = isAdmin
    ? payload?.draft ?? payload?.published ?? null
    : payload?.published ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        mba: mbaNumber,
        version: String(versionNumber),
      })
      const res = await fetch(`/api/campaign-reads?${qs.toString()}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error("Could not load the campaign read")
      const json = (await res.json()) as CampaignReadListPayload
      setPayload(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the campaign read")
    } finally {
      setLoading(false)
    }
  }, [mbaNumber, versionNumber])

  useEffect(() => {
    void load()
  }, [load])

  const regenerate = useCallback(async () => {
    if (!isAdmin || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/campaign-reads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mbaNumber,
          versionNumber,
          clientSlug,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || "Generate failed")
      }
      setEditing(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed")
    } finally {
      setBusy(false)
    }
  }, [busy, clientSlug, isAdmin, load, mbaNumber, versionNumber])

  useEffect(() => {
    if (!isAdmin || regenerateToken <= 0 || regenerateToken === lastRegen.current) return
    lastRegen.current = regenerateToken
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    void regenerate()
  }, [isAdmin, regenerate, regenerateToken])

  async function mutate(path: string, method = "POST", body?: unknown) {
    if (!visible) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(json?.message || "Update failed")
      }
      setEditing(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin && (loading || !payload?.published)) return null

  if (loading && !payload) {
    return (
      <section
        id="campaign-read"
        className="rounded-card border border-border bg-card p-5 shadow-e1"
      >
        <div className="h-24 animate-pulse rounded-input bg-muted/40" />
      </section>
    )
  }

  if (!isAdmin && payload?.published) {
    return (
      <section
        id="campaign-read"
        className="space-y-4 rounded-card border border-border bg-card p-5 shadow-e1"
      >
        <CampaignReadBeatsView
          beats={payload.published.beats}
          readAsAt={formatReadAsAt(payload.published.publishedAt ?? payload.published.generatedAt)}
        />
      </section>
    )
  }

  if (isAdmin && !visible) {
    return (
      <section
        id="campaign-read"
        ref={rootRef}
        className="space-y-3 rounded-card border border-border bg-card p-5 shadow-e1"
      >
        <h2 className="text-base font-semibold text-foreground">Campaign read</h2>
        <p className="text-sm text-muted-foreground">No read yet</p>
        {error ? <p className="text-sm text-status-critical-fg">{error}</p> : null}
        <Button type="button" onClick={() => void regenerate()} disabled={busy}>
          {busy ? "Generating…" : "Regenerate"}
        </Button>
      </section>
    )
  }

  if (!visible) return null

  return (
    <section
      id="campaign-read"
      ref={rootRef}
      className="space-y-4 rounded-card border border-border bg-card p-5 shadow-e1"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Campaign read</h2>
            <Badge variant={visible.status === "published" ? "default" : "outline"}>
              {visible.status === "published" ? "Published" : "Draft"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Read as at {formatReadAsAt(visible.publishedAt ?? visible.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void regenerate()} disabled={busy}>
            {busy ? "Working…" : "Regenerate"}
          </Button>
          {editing ? (
            <Button
              type="button"
              size="sm"
              disabled={busy || !draftBeats}
              onClick={() =>
                void mutate(`/api/campaign-reads/${visible.id}`, "PATCH", { beats: draftBeats })
              }
            >
              Save
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraftBeats({ ...visible.beats })
                setEditing(true)
              }}
            >
              Edit
            </Button>
          )}
          {visible.status === "published" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void mutate(`/api/campaign-reads/${visible.id}/unpublish`)}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void mutate(`/api/campaign-reads/${visible.id}/publish`)}
            >
              Publish
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            History
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-status-critical-fg">{error}</p> : null}

      {CAMPAIGN_READ_BEAT_KEYS.map((key) => (
        <BeatBlock
          key={key}
          beatKey={key}
          text={visible.beats[key]}
          editing={editing}
          draft={draftBeats?.[key] ?? visible.beats[key]}
          onChange={(value) =>
            setDraftBeats((prev) => ({
              ...(prev ?? visible.beats),
              [key]: value,
            }))
          }
        />
      ))}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Read history</DialogTitle>
          </DialogHeader>
          <ul className="max-h-80 space-y-3 overflow-y-auto text-sm">
            {(payload?.history ?? []).length === 0 ? (
              <li className="text-muted-foreground">No prior generations.</li>
            ) : (
              (payload?.history ?? []).map((row) => (
                <li key={row.id} className="rounded-input border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{row.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatReadAsAt(row.generatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{row.generatedByEmail}</p>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  )
}
