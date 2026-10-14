"use client"

import { useState } from "react"

import { WebReportView } from "@/components/dashboard/web/WebReportView"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BUILDER_NEEDS_MIGRATION,
  WEB_REPORT_VERSION_KEEP,
  addElement,
  elementNeedsData,
  elementTitle,
  moveElement,
  parseBrandTerms,
  removeElement,
} from "@/lib/webReport/builder/layout"
import { describeElementSettings, type SettingsField } from "@/lib/webReport/builder/settingsForm"
import {
  WEB_ELEMENT_GROUPS,
  WEB_REPORT_ELEMENTS,
  type WebElementId,
  type WebReportLayoutItem,
} from "@/lib/webReport/elements"
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/webReport/periods"
import type { WebReportData } from "@/lib/webReport/types"

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  last_month: "Last month",
  last_28_days: "Last 28 days",
  month_to_date_yoy: "This month last year",
}

const OPTION_LABEL: Record<string, string> = {
  users: "Users",
  newUsers: "New users",
  sessions: "Sessions",
  engagementRate: "Engagement rate",
  keyEvents: "Key events",
  pageViews: "Page views",
  clicks: "Clicks",
  impressions: "Impressions",
  ctr: "CTR",
  position: "Position",
  avSpend: "AV spend",
  metric: "Metric",
  keyEvent: "Key event",
  all: "All queries",
  brand: "Brand",
  non_brand: "Non-brand",
}

type BuilderOption = { value: string; label: string }
type BuilderVersion = { version: number; savedAt: string | null }

function optionLabel(value: string): string {
  return OPTION_LABEL[value] ?? value
}

function asRecord(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {}
  return { ...(settings as Record<string, unknown>) }
}

function fieldClass() {
  return "h-9 w-full rounded-input border border-border bg-background px-2 text-sm text-foreground"
}

function SettingsControl({
  field,
  value,
  keyEventNames,
  onChange,
}: {
  field: SettingsField
  value: unknown
  keyEventNames: string[]
  onChange: (value: unknown) => void
}) {
  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    )
  }
  if (field.kind === "string") {
    if (field.key === "text") {
      return (
        <textarea
          className="min-h-28 w-full rounded-input border border-border bg-background px-3 py-2 text-sm text-foreground"
          maxLength={2000}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    const names = field.key === "eventName" ? keyEventNames : []
    if (field.key === "eventName") {
      return (
        <select className={fieldClass()} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || undefined)}>
          <option value="">{names.length === 0 ? "No key event names from this property yet" : "Choose a key event"}</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )
    }
    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  if (field.kind === "number") {
    return (
      <Input
        className="num"
        type="number"
        min={field.min}
        max={field.max}
        step={field.integer ? 1 : "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === "") {
            onChange(undefined)
            return
          }
          const next = Number(raw)
          onChange(Number.isFinite(next) ? next : undefined)
        }}
      />
    )
  }
  if (field.kind === "enum") {
    return (
      <select
        className={fieldClass()}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        {field.optional ? <option value="">None</option> : null}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    )
  }
  if (field.kind === "enumList") {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="flex flex-col gap-2">
        {field.options.map((option) => {
          const checked = selected.includes(option)
          return (
            <label key={option} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked ? selected.filter((item) => item !== option) : [...selected, option]
                  onChange(next)
                }}
              />
              {optionLabel(option)}
            </label>
          )
        })}
      </div>
    )
  }
  const items = Array.isArray(value) ? value : []
  const max = field.max ?? 8
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-input border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">
              Tile <span className="num">{index + 1}</span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={field.min != null && items.length <= field.min}
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </Button>
          </div>
          {field.fields.map((child) => (
            <label key={child.key} className="flex flex-col gap-1 text-sm text-foreground">
              {child.kind === "boolean" ? null : <span>{child.label}</span>}
              <SettingsControl
                field={child}
                value={asRecord(item)[child.key]}
                keyEventNames={keyEventNames}
                onChange={(next) => {
                  const copy = items.slice()
                  const record = asRecord(item)
                  if (next === undefined) delete record[child.key]
                  else record[child.key] = next
                  copy[index] = record
                  onChange(copy)
                }}
              />
            </label>
          ))}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= max}
        onClick={() => onChange([...items, { kind: "metric", metric: "sessions" }])}
      >
        Add tile
      </Button>
    </div>
  )
}

export function ReportBuilder({
  slug,
  clientName,
  migrationApplied,
  initialLayout,
  currentVersion,
  versions,
  ga4PropertyRef,
  gscSiteRef,
  brandTerms,
  defaultPeriod,
  ga4Options,
  gscOptions,
  keyEventNames,
}: {
  slug: string
  clientName: string
  migrationApplied: boolean
  initialLayout: WebReportLayoutItem[]
  currentVersion: number
  versions: BuilderVersion[]
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  ga4Options: BuilderOption[]
  gscOptions: BuilderOption[]
  keyEventNames: string[]
}) {
  const [layout, setLayout] = useState(initialLayout)
  const [selected, setSelected] = useState(0)
  const [ga4, setGa4] = useState(ga4PropertyRef ?? "")
  const [gsc, setGsc] = useState(gscSiteRef ?? "")
  const [terms, setTerms] = useState(brandTerms.join(", "))
  const [period, setPeriod] = useState<ReportPeriod>(defaultPeriod)
  const [version, setVersion] = useState(currentVersion)
  const [history, setHistory] = useState(versions)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"save" | "preview" | "restore" | null>(null)
  const [preview, setPreview] = useState<{ data: WebReportData; connected: boolean } | null>(null)

  const selectedItem = layout[selected] ?? null
  const fields = selectedItem ? describeElementSettings(selectedItem.elementId) : []

  function connectionBody() {
    return {
      ga4PropertyRef: ga4.trim() || null,
      gscSiteRef: gsc.trim() || null,
      brandTerms: parseBrandTerms(terms),
      defaultPeriod: period,
      layout,
    }
  }

  async function post(body: unknown) {
    const response = await fetch(`/api/dashboard/${slug}/web-builder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string; version?: number; layout?: WebReportLayoutItem[]; data?: WebReportData; connected?: boolean } | null
    return { response, payload }
  }

  async function onSave() {
    setBusy("save")
    setError(null)
    try {
      const { response, payload } = await post({ action: "save", ...connectionBody() })
      if (!response.ok || payload?.version == null) {
        setError(payload?.error ?? "The report could not be saved")
        return
      }
      setVersion(payload.version)
      setMessage(payload.message ?? null)
      setHistory((current) => {
        const next = [{ version: payload.version as number, savedAt: new Date().toISOString() }, ...current.filter((row) => row.version !== payload.version)]
        return next.slice(0, WEB_REPORT_VERSION_KEEP)
      })
    } catch {
      setError("The report could not be saved")
    } finally {
      setBusy(null)
    }
  }

  async function onRestore(target: number) {
    setBusy("restore")
    setError(null)
    try {
      const { response, payload } = await post({ action: "restore", version: target })
      if (!response.ok || payload?.version == null) {
        setError(payload?.error ?? "That version could not be restored")
        return
      }
      if (Array.isArray(payload.layout)) {
        setLayout(payload.layout)
        setSelected(0)
      }
      setVersion(payload.version)
      setMessage(payload.message ?? null)
    } catch {
      setError("That version could not be restored")
    } finally {
      setBusy(null)
    }
  }

  async function onPreview() {
    setBusy("preview")
    setError(null)
    try {
      const { response, payload } = await post({ action: "preview", ...connectionBody() })
      if (!response.ok || !payload?.data) {
        setError(payload?.error ?? "Preview could not be loaded")
        return
      }
      setPreview({ data: payload.data, connected: Boolean(payload.connected) })
    } catch {
      setError("Preview could not be loaded")
    } finally {
      setBusy(null)
    }
  }

  function updateSettings(next: unknown) {
    setLayout((current) => current.map((item, index) => (index === selected ? { ...item, settings: next } : item)))
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Report builder"
        accent={clientName}
        punctuate={false}
        lede={<p>Choose the elements this client sees on Web & search.</p>}
        meta={message ? <p>{message}</p> : null}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={busy != null} onClick={() => void onPreview()}>
              {busy === "preview" ? "Loading preview" : "Preview"}
            </Button>
            <Button type="button" variant="action" disabled={!migrationApplied || busy != null || layout.length === 0} onClick={() => void onSave()}>
              {busy === "save" ? "Saving" : "Save"}
            </Button>
          </div>
        }
      />

      {migrationApplied ? null : (
        <p className="rounded-card border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{BUILDER_NEEDS_MIGRATION}</p>
      )}
      {error ? (
        <p className="rounded-card border border-border bg-card px-4 py-3 text-sm text-status-critical-fg">{error}</p>
      ) : null}

      <section className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-e1 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Google Analytics 4 property
          <select className={fieldClass()} value={ga4} onChange={(event) => setGa4(event.target.value)}>
            <option value="">Not connected</option>
            {ga4Options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Search Console site
          <select className={fieldClass()} value={gsc} onChange={(event) => setGsc(event.target.value)}>
            <option value="">Not connected</option>
            {gscOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Brand terms
          <Input value={terms} placeholder="brand, product" onChange={(event) => setTerms(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Default period
          <select className={fieldClass()} value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
            {REPORT_PERIODS.map((value) => (
              <option key={value} value={value}>
                {PERIOD_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <section className="rounded-card border border-border bg-card p-3 shadow-e1">
          <h2 className="px-1 text-sm font-semibold text-foreground">Elements</h2>
          <div className="mt-3 flex flex-col gap-4">
            {WEB_ELEMENT_GROUPS.map((group) => (
              <div key={group}>
                <p className="px-1 text-xs font-semibold text-muted-foreground">{group}</p>
                <div className="mt-1 flex flex-col gap-1">
                  {(Object.values(WEB_REPORT_ELEMENTS) as Array<(typeof WEB_REPORT_ELEMENTS)[WebElementId]>)
                    .filter((element) => element.group === group)
                    .map((element) => {
                      const needsData = elementNeedsData(element.id)
                      return (
                        <button
                          key={element.id}
                          type="button"
                          className={`interactive rounded-input border px-2 py-2 text-left text-sm text-foreground ${
                            needsData ? "border-dashed border-border" : "border-border"
                          }`}
                          onClick={() => {
                            setLayout((current) => addElement(current, element.id))
                            setSelected(layout.length)
                          }}
                        >
                          <span className="block">{element.title}</span>
                          {needsData ? <span className="text-xs text-muted-foreground">Needs data</span> : null}
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-card border border-border bg-card p-3 shadow-e1">
          <h2 className="px-1 text-sm font-semibold text-foreground">Layout</h2>
          {layout.length === 0 ? (
            <p className="mt-3 px-1 text-sm text-muted-foreground">Add an element from the library.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {layout.map((item, index) => (
                <li key={`${item.elementId}-${index}`}>
                  <div
                    className={`flex items-center gap-2 rounded-input border px-2 py-2 ${
                      index === selected ? "border-primary bg-muted" : "border-border"
                    }`}
                  >
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelected(index)}>
                      <span className="num w-5 text-sm text-muted-foreground">{index + 1}</span>
                      <span className="truncate text-sm text-foreground">{elementTitle(item.elementId)}</span>
                    </button>
                    <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => { setLayout((current) => moveElement(current, index, -1)); setSelected(index === selected ? index - 1 : selected) }}>
                      Move up
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={index === layout.length - 1} onClick={() => { setLayout((current) => moveElement(current, index, 1)); setSelected(index === selected ? index + 1 : selected) }}>
                      Move down
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLayout((current) => removeElement(current, index))
                        setSelected((current) => Math.max(0, Math.min(current, layout.length - 2)))
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {migrationApplied && history.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="px-1 text-xs font-semibold text-muted-foreground">
                Published version <span className="num">{version}</span>
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {history.map((row) => (
                  <Button
                    key={row.version}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!migrationApplied || busy != null || row.version === version}
                    onClick={() => void onRestore(row.version)}
                  >
                    Restore version <span className="num">{row.version}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-card border border-border bg-card p-3 shadow-e1">
          <h2 className="px-1 text-sm font-semibold text-foreground">Settings</h2>
          {selectedItem == null ? (
            <p className="mt-3 px-1 text-sm text-muted-foreground">Select an element to edit it.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <p className="px-1 text-sm text-foreground">{elementTitle(selectedItem.elementId)}</p>
              {fields.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">This element has no settings.</p>
              ) : (
                fields.map((field) => (
                  <label key={field.key} className="flex flex-col gap-1 px-1 text-sm text-foreground">
                    {field.kind === "boolean" ? null : (
                      <span className={field.kind === "enumList" || field.kind === "objectList" ? "font-medium" : undefined}>
                        {field.label}
                      </span>
                    )}
                    <SettingsControl
                      field={field}
                      value={asRecord(selectedItem.settings)[field.key]}
                      keyEventNames={keyEventNames}
                      onChange={(next) => {
                        const record = asRecord(selectedItem.settings)
                        if (next === undefined) delete record[field.key]
                        else record[field.key] = next
                        updateSettings(record)
                      }}
                    />
                  </label>
                ))
              )}
            </div>
          )}
        </section>
      </div>

      {preview ? (
        <div className="rounded-frame border border-border bg-background">
          <WebReportView
            slug={slug}
            clientName={clientName}
            period={period}
            layout={layout}
            data={preview.data}
            connected={preview.connected}
            interactivePeriod={false}
          />
        </div>
      ) : null}
    </div>
  )
}
