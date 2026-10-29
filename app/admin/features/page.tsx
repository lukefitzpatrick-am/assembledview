"use client"

import { useCallback, useEffect, useState } from "react"

import { AdminGuard } from "@/components/guards/AdminGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { StatusPill } from "@/components/ui/status-pill"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import type { FeaturePageGroup, FeaturePageRow } from "@/lib/features/pageModel"

type SigningRow = { purpose: string; label: string; source: "feature_secret" | "app_signing_secret" | "missing" }

type EventRow = {
  id: number
  createdAt: string
  key: string
  fromEnabled: boolean | null
  toEnabled: boolean
  changedByName: string | null
  note: string | null
}

type FeaturesResponse = { ready: boolean; groups: FeaturePageGroup[]; events: EventRow[]; signing: SigningRow[] }

const SIGNING_LABEL: Record<SigningRow["source"], string> = {
  feature_secret: "Its own secret",
  app_signing_secret: "APP_SIGNING_SECRET",
  missing: "Missing",
}

function onOff(v: boolean | null): string {
  return v == null ? "not set" : v ? "on" : "off"
}

function FeaturesPageInner() {
  const { toast } = useToast()
  const [data, setData] = useState<FeaturesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ row: FeaturePageRow; to: boolean } | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/features", { cache: "no-store" })
      const body = (await res.json().catch(() => null)) as (FeaturesResponse & { error?: string }) | null
      if (!res.ok || !body) {
        setError(body?.error || "Could not load the feature switches.")
        return
      }
      setData(body)
    } catch {
      setError("Could not load the feature switches.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const labelFor = useCallback(
    (key: string) => data?.groups.flatMap((g) => g.rows).find((r) => r.key === key)?.label ?? key,
    [data],
  )

  async function confirmToggle() {
    if (!pending) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: pending.row.key, enabled: pending.to, note: note.trim() || null }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null
      if (!res.ok) {
        toast({ title: "Switch not changed", description: body?.message || body?.error || "Try again.", variant: "destructive" })
        return
      }
      toast({
        title: `${pending.row.label} is ${pending.to ? "on" : "off"}`,
        description: "Live on this server now and everywhere within a minute. Reload other open tabs.",
      })
      setPending(null)
      setNote("")
      await load()
    } catch {
      toast({ title: "Switch not changed", description: "Try again.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Features"
        lede="Turn features on and off without a redeploy. A switch with no setting here reads its old env var."
      />
      {loading && !data ? <LoadingState /> : null}
      {error ? <ErrorState title="Features unavailable" message={error} onRetry={() => void load()} /> : null}
      {data && !data.ready ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Run SQL 0111 (sql/supabase/2026-10-30_0111_feature_switches_SUPABASE.sql) to switch features from this page.
          Until then every feature reads its env var, shown below.
        </p>
      ) : null}
      {data?.groups.map((group) => (
        <section key={group.area} className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
          <ul className="divide-y rounded-md border">
            {group.rows.map((row) => (
              <li key={row.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.label}</span>
                    <StatusPill tone={row.enabled ? "outcome" : "neutral"} label={row.enabled ? "On" : "Off"} size="sm" />
                    <span className="text-xs text-muted-foreground">{row.sourceLabel}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                  {row.lastChanged ? (
                    <p className="text-xs text-muted-foreground">
                      Last changed {row.lastChanged}
                      {row.note ? `: ${row.note}` : ""}
                    </p>
                  ) : null}
                  {row.hint ? <p className="text-xs text-muted-foreground">{row.hint}</p> : null}
                </div>
                <Switch
                  checked={row.enabled}
                  disabled={!row.canToggle || saving}
                  aria-label={`${row.label} ${row.enabled ? "on" : "off"}`}
                  onCheckedChange={(to) => {
                    setNote("")
                    setPending({ row, to })
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Signing keys</h2>
          <ul className="divide-y rounded-md border">
            {data.signing.map((s) => (
              <li key={s.purpose} className="flex items-center justify-between p-3 text-sm">
                <span>{s.label}</span>
                <StatusPill tone={s.source === "missing" ? "critical" : "neutral"} label={SIGNING_LABEL[s.source]} size="sm" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            New features derive their key from APP_SIGNING_SECRET. A feature&apos;s own secret still wins while it is set.
          </p>
        </section>
      ) : null}
      {data && data.events.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <ul className="divide-y rounded-md border text-sm">
            {data.events.map((e) => (
              <li key={e.id} className="p-3">
                <span className="font-medium">{labelFor(e.key)}</span> {onOff(e.fromEnabled)} to {onOff(e.toEnabled)}
                <span className="text-muted-foreground">
                  {" "}
                  · {e.createdAt.slice(0, 16).replace("T", " ")}
                  {e.changedByName ? ` · ${e.changedByName}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <AlertDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open && !saving) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Turn {pending?.row.label} {pending?.to ? "on" : "off"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It applies to everyone on this server now and on every server within a minute. Open pages pick it up on
              reload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            maxLength={500}
            placeholder="Note (optional): why"
            aria-label="Note"
            onChange={(event) => setNote(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault()
                void confirmToggle()
              }}
            >
              {saving ? "Saving" : pending?.to ? "Turn on" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

export default function AdminFeaturesPage() {
  return (
    <AdminGuard>
      <FeaturesPageInner />
    </AdminGuard>
  )
}
