"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SettingsField } from "@/lib/webReport/builder/settingsForm"

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
  savedKpi: "Saved KPI",
  "6": "Last 6 months",
  "12": "Last 12 months",
  all: "All queries",
  brand: "Brand",
  non_brand: "Non-brand",
}

function optionLabel(value: string): string {
  return OPTION_LABEL[value] ?? value
}

export function asRecord(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {}
  return { ...(settings as Record<string, unknown>) }
}

export const BUILDER_FIELD_CLASS =
  "h-11 w-full rounded-input border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const CHECK_ROW = "flex min-h-11 items-center gap-2 text-sm text-foreground"

/** An active saved KPI, picked by label and stored by id. */
export type SavedKpiOption = { id: string; label: string }

export function SettingsControl({
  field,
  value,
  keyEventNames,
  savedKpis = [],
  onChange,
}: {
  field: SettingsField
  value: unknown
  keyEventNames: string[]
  savedKpis?: SavedKpiOption[]
  onChange: (value: unknown) => void
}) {
  if (field.kind === "stringList") {
    const selected = Array.isArray(value) ? value.map(String) : []
    const max = field.max ?? 6
    if (savedKpis.length === 0) {
      return <p className="text-sm text-muted-foreground">No saved KPIs yet. Add them on the KPIs tab.</p>
    }
    return (
      <div className="flex flex-col">
        {savedKpis.map((kpi) => {
          const checked = selected.includes(kpi.id)
          return (
            <label key={kpi.id} className={CHECK_ROW}>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={checked}
                disabled={!checked && selected.length >= max}
                onChange={() => onChange(checked ? selected.filter((id) => id !== kpi.id) : [...selected, kpi.id])}
              />
              {kpi.label}
            </label>
          )
        })}
      </div>
    )
  }
  if (field.kind === "boolean") {
    return (
      <label className={CHECK_ROW}>
        <input type="checkbox" className="h-4 w-4" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    )
  }
  if (field.kind === "string") {
    if (field.key === "text") {
      return (
        <textarea
          aria-label={field.label}
          className="min-h-28 w-full rounded-input border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={2000}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    if (field.key === "eventName") {
      return (
        <select
          aria-label={field.label}
          className={BUILDER_FIELD_CLASS}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">{keyEventNames.length === 0 ? "No key event names from this property yet" : "Choose a key event"}</option>
          {keyEventNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )
    }
    if (field.key === "kpiId") {
      return (
        <select
          aria-label={field.label}
          className={BUILDER_FIELD_CLASS}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">{savedKpis.length === 0 ? "No saved KPIs yet" : "Choose a saved KPI"}</option>
          {savedKpis.map((kpi) => (
            <option key={kpi.id} value={kpi.id}>
              {kpi.label}
            </option>
          ))}
        </select>
      )
    }
    return (
      <Input
        aria-label={field.label}
        className="h-11"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  if (field.kind === "number") {
    return (
      <Input
        aria-label={field.label}
        className="num h-11"
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
        aria-label={field.label}
        className={BUILDER_FIELD_CLASS}
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
      <div className="flex flex-col">
        {field.options.map((option) => {
          const checked = selected.includes(option)
          return (
            <label key={option} className={CHECK_ROW}>
              <input
                type="checkbox"
                className="h-4 w-4"
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
              className="min-h-11"
              disabled={field.min != null && items.length <= field.min}
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove tile
            </Button>
          </div>
          {field.fields.map((child) => (
            <label key={child.key} className="flex flex-col gap-1 text-sm text-foreground">
              {child.kind === "boolean" ? null : <span>{child.label}</span>}
              <SettingsControl
                field={child}
                value={asRecord(item)[child.key]}
                keyEventNames={keyEventNames}
                savedKpis={savedKpis}
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
        className="min-h-11"
        disabled={items.length >= max}
        onClick={() => onChange([...items, { kind: "metric", metric: "sessions" }])}
      >
        Add tile
      </Button>
    </div>
  )
}
