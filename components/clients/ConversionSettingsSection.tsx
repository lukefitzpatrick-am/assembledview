"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  CONVERSION_CATEGORIES,
  CONVERSION_HEADLINES,
  DEFAULT_CONVERSION_SETTINGS,
  conversionEventProblems,
  headlineLabel,
  isConversionCategory,
  isConversionHeadline,
  isConversionPlatform,
  valueAllowed,
  type ConversionCategory,
  type ConversionEventChoice,
  type ConversionPlatform,
  type ConversionSettings,
} from "@/lib/delivery/conversions/rules"

type AvailableEvent = {
  platform: string
  eventKey: string
  eventName: string
  eventCategory: string
  conversions: number
  conversionValue: number
  lineCount: number
}

/** One row in the picker: an event seen in the data, a saved choice, or both. */
export type ConversionPickerRow = {
  platform: ConversionPlatform
  eventKey: string
  eventName: string
  seenConversions: number | null
  seenValue: number | null
  chosen: boolean
  label: string
  category: ConversionCategory
  includeValue: boolean
}

const PLATFORM_LABELS: Record<ConversionPlatform, string> = {
  meta_ads: "Meta",
  google_ads: "Google Ads",
  tiktok: "TikTok",
  dv360: "DV360",
  cm360: "CM360",
  taboola: "Taboola",
  reddit: "Reddit",
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error || `Request failed (${res.status})`
}

/** Merge events seen in Snowflake with saved choices. Saved choices keep their label and category. */
export function mergePickerRows(
  available: readonly AvailableEvent[],
  saved: readonly ConversionEventChoice[],
): ConversionPickerRow[] {
  const rows = new Map<string, ConversionPickerRow>()
  for (const a of available) {
    if (!isConversionPlatform(a.platform)) continue
    rows.set(`${a.platform}|${a.eventKey}`, {
      platform: a.platform,
      eventKey: a.eventKey,
      eventName: a.eventName || a.eventKey,
      seenConversions: a.conversions,
      seenValue: a.conversionValue,
      chosen: false,
      label: "",
      category: isConversionCategory(a.eventCategory) ? a.eventCategory : "other",
      includeValue: false,
    })
  }
  for (const s of saved) {
    const key = `${s.platform}|${s.eventKey}`
    const base = rows.get(key)
    rows.set(key, {
      platform: s.platform,
      eventKey: s.eventKey,
      eventName: base?.eventName ?? s.eventKey,
      seenConversions: base?.seenConversions ?? null,
      seenValue: base?.seenValue ?? null,
      chosen: true,
      label: s.label ?? "",
      category: s.category,
      includeValue: s.includeValue,
    })
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.platform.localeCompare(b.platform) ||
      Number(b.chosen) - Number(a.chosen) ||
      (b.seenConversions ?? 0) - (a.seenConversions ?? 0),
  )
}

export function choicesFromRows(rows: readonly ConversionPickerRow[]): ConversionEventChoice[] {
  return rows
    .filter((r) => r.chosen)
    .map((r) => ({
      platform: r.platform,
      eventKey: r.eventKey,
      label: r.label.trim() || null,
      category: r.category,
      includeValue: r.includeValue && valueAllowed(r),
    }))
}

function fmtCount(n: number | null): string {
  return n == null ? "Not seen in 180 days" : `${Math.round(n).toLocaleString("en-AU")} in 180 days`
}

function fmtValue(n: number | null): string | null {
  return n != null && n > 0 ? `$${Math.round(n).toLocaleString("en-AU")} value` : null
}

export function ConversionSettingsSection({ clientId }: { clientId: number }) {
  const [settings, setSettings] = useState<ConversionSettings>({ ...DEFAULT_CONVERSION_SETTINGS })
  const [rows, setRows] = useState<ConversionPickerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventsNote, setEventsNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [serverProblems, setServerProblems] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const loadSettings = fetch(`/api/clients/${clientId}/conversion-settings`).then(async (res) => {
      if (res.status === 503) return { notReady: true as const }
      if (!res.ok) throw new Error(await readError(res))
      return (await res.json()) as { settings: ConversionSettings; events: ConversionEventChoice[] }
    })
    const loadAvailable = fetch(`/api/clients/${clientId}/conversion-events/available`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res))
        return ((await res.json()) as { events?: AvailableEvent[]; note?: string })
      })
      .catch((err: unknown) => ({
        events: [] as AvailableEvent[],
        note: err instanceof Error ? `Could not list events: ${err.message}` : "Could not list events",
      }))

    void Promise.all([loadSettings, loadAvailable])
      .then(([config, available]) => {
        if (cancelled) return
        if ("notReady" in config) {
          setNote("Conversion settings are not set up yet")
          setRows(mergePickerRows(available.events ?? [], []))
        } else {
          setSettings({
            enabled: config.settings.enabled,
            headline: isConversionHeadline(config.settings.headline) ? config.settings.headline : "conversions",
            showRevenue: config.settings.showRevenue,
          })
          setRows(mergePickerRows(available.events ?? [], config.events ?? []))
          setNote(null)
        }
        setEventsNote(available.note ?? null)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load conversion settings")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const choices = useMemo(() => choicesFromRows(rows), [rows])
  const problems = useMemo(() => conversionEventProblems(choices), [choices])
  const byPlatform = useMemo(() => {
    const map = new Map<ConversionPlatform, ConversionPickerRow[]>()
    for (const row of rows) map.set(row.platform, [...(map.get(row.platform) ?? []), row])
    return [...map.entries()]
  }, [rows])

  function patchRow(platform: ConversionPlatform, eventKey: string, patch: Partial<ConversionPickerRow>) {
    setSaved(false)
    setRows((prev) =>
      prev.map((r) => {
        if (r.platform !== platform || r.eventKey !== eventKey) return r
        const next = { ...r, ...patch }
        if (!valueAllowed(next)) next.includeValue = false
        return next
      }),
    )
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setServerProblems([])
    try {
      const res = await fetch(`/api/clients/${clientId}/conversion-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, events: choices }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string; problems?: string[] } | null
        setServerProblems(body?.problems ?? [body?.error || `Request failed (${res.status})`])
        return
      }
      setSaved(true)
    } catch (err) {
      setServerProblems([err instanceof Error ? err.message : "Could not save"])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="conversion-settings" className="min-w-0 scroll-mt-6 rounded-md border p-4">
      <h3 className="mb-1 text-lg font-semibold">Conversions</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        When on, everyone who can see this client&apos;s campaigns sees the chosen conversions on delivery. Counts run to
        yesterday. OOH is not affected.
      </p>

      {loading ? <p className="mb-4 text-sm text-muted-foreground">Loading conversion settings…</p> : null}
      {error ? (
        <p className="mb-4 rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? <p className="mb-4 text-sm text-muted-foreground">{note}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 text-sm">
          <Switch
            aria-label="Show conversions"
            checked={settings.enabled}
            onCheckedChange={(checked) => {
              setSaved(false)
              setSettings((s) => ({ ...s, enabled: checked }))
            }}
          />
          <span className="font-medium">Show conversions</span>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Headline</span>
          <Select
            value={settings.headline}
            onValueChange={(value) => {
              if (!isConversionHeadline(value)) return
              setSaved(false)
              setSettings((s) => ({ ...s, headline: value }))
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Headline" />
            </SelectTrigger>
            <SelectContent>
              {CONVERSION_HEADLINES.map((h) => (
                <SelectItem key={h} value={h}>
                  {headlineLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center gap-3 text-sm">
          <Switch
            aria-label="Show revenue and ROAS"
            checked={settings.showRevenue}
            onCheckedChange={(checked) => {
              setSaved(false)
              setSettings((s) => ({ ...s, showRevenue: checked }))
            }}
          />
          <span className="font-medium">Show revenue and ROAS</span>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">Events that count</p>
        {eventsNote ? <p className="mb-2 text-xs text-muted-foreground">{eventsNote}</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversion events seen for this client in the last 180 days.</p>
        ) : null}
        {byPlatform.map(([platform, platformRows]) => (
          <div key={platform} className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{PLATFORM_LABELS[platform]}</p>
            <ul className="divide-y divide-border rounded-input border">
              {platformRows.map((row) => {
                const value = fmtValue(row.seenValue)
                const canValue = valueAllowed(row)
                return (
                  <li
                    key={`${row.platform}|${row.eventKey}`}
                    className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[auto_1fr_10rem_10rem_auto]"
                  >
                    <Checkbox
                      aria-label={`Count ${row.eventName}`}
                      checked={row.chosen}
                      onCheckedChange={(checked) => patchRow(row.platform, row.eventKey, { chosen: checked === true })}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={row.eventKey}>
                        {row.eventName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtCount(row.seenConversions)}
                        {value ? ` · ${value}` : ""}
                      </p>
                    </div>
                    <Input
                      aria-label={`Label for ${row.eventName}`}
                      value={row.label}
                      placeholder="Label (optional)"
                      disabled={!row.chosen}
                      onChange={(e) => patchRow(row.platform, row.eventKey, { label: e.target.value })}
                    />
                    <Select
                      value={row.category}
                      disabled={!row.chosen}
                      onValueChange={(v) => {
                        if (isConversionCategory(v)) patchRow(row.platform, row.eventKey, { category: v })
                      }}
                    >
                      <SelectTrigger aria-label={`Category for ${row.eventName}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONVERSION_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c === "purchase" ? "Purchase" : c === "lead" ? "Lead" : "Other"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        aria-label={`Revenue from ${row.eventName}`}
                        checked={row.includeValue}
                        disabled={!row.chosen || !canValue}
                        onCheckedChange={(checked) =>
                          patchRow(row.platform, row.eventKey, { includeValue: checked === true })
                        }
                      />
                      <span className={canValue ? "" : "text-muted-foreground"}>Revenue</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {problems.length > 0 || serverProblems.length > 0 ? (
        <ul className="mt-3 list-disc pl-5 text-sm text-destructive">
          {[...problems, ...serverProblems].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={saving || loading || Boolean(note) || problems.length > 0}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save conversions"}
        </Button>
        {saved ? <span className="text-sm text-muted-foreground">Saved</span> : null}
      </div>
    </div>
  )
}
