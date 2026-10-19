"use client"

import { Button } from "@/components/ui/button"
import { SettingsControl, asRecord } from "@/components/dashboard/web/builder/SettingsControl"
import {
  DISPLAY_LABEL,
  WIDTH_OPTIONS,
  displayOptions,
  elementNote,
  entryDisplay,
  entryWidth,
  type BuilderEntry,
} from "@/lib/webReport/builder/editor"
import { elementTitle } from "@/lib/webReport/builder/layout"
import { describeElementSettings } from "@/lib/webReport/builder/settingsForm"
import type { WebDisplay, WebWidth } from "@/lib/webReport/elements"

function choiceClass(active: boolean): string {
  return `interactive-tint min-h-11 rounded-input border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
  }`
}

export function ElementSettingsPanel({
  entry,
  index,
  total,
  keyEventNames,
  onDisplay,
  onWidth,
  onSettings,
  onMove,
  onRemove,
}: {
  entry: BuilderEntry | null
  index: number
  total: number
  keyEventNames: string[]
  onDisplay: (display: WebDisplay) => void
  onWidth: (width: WebWidth) => void
  onSettings: (settings: unknown) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  if (entry == null) {
    return (
      <section aria-label="Element settings" className="rounded-card border border-border bg-card p-3 shadow-e1">
        <h2 className="px-1 text-sm font-semibold text-foreground">Settings</h2>
        <p className="mt-3 px-1 text-sm text-muted-foreground">Select an element in the report to edit it.</p>
      </section>
    )
  }

  const display = entryDisplay(entry)
  const width = entryWidth(entry)
  const fields = describeElementSettings(entry.item.elementId)
  const note = elementNote(entry.item)
  const title = elementTitle(entry.item.elementId)

  return (
    <section aria-label="Element settings" className="flex flex-col gap-4 rounded-card border border-border bg-card p-3 shadow-e1">
      <h2 className="px-1 text-sm font-semibold text-foreground">{title}</h2>

      <fieldset className="flex flex-col gap-2 px-1">
        <legend className="text-xs font-semibold text-muted-foreground">Display</legend>
        <div className="grid grid-cols-2 gap-2">
          {displayOptions(entry.item.elementId).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === display}
              className={choiceClass(option === display)}
              onClick={() => onDisplay(option)}
            >
              {DISPLAY_LABEL[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 px-1">
        <legend className="text-xs font-semibold text-muted-foreground">Width</legend>
        <div className="grid grid-cols-3 gap-2">
          {WIDTH_OPTIONS.map((option) => (
            <button
              key={option.width}
              type="button"
              aria-pressed={option.width === width}
              className={choiceClass(option.width === width)}
              onClick={() => onWidth(option.width)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 px-1">
        <p className="text-xs font-semibold text-muted-foreground">Data</p>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">This element has no data settings.</p>
        ) : (
          fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-sm text-foreground">
              {field.kind === "boolean" ? null : (
                <span className={field.kind === "enumList" || field.kind === "objectList" ? "font-medium" : undefined}>
                  {field.label}
                </span>
              )}
              <SettingsControl
                field={field}
                value={asRecord(entry.item.settings)[field.key]}
                keyEventNames={keyEventNames}
                onChange={(next) => {
                  const record = asRecord(entry.item.settings)
                  if (next === undefined) delete record[field.key]
                  else record[field.key] = next
                  onSettings(record)
                }}
              />
            </label>
          ))
        )}
      </div>

      {note ? <p className="px-1 text-xs text-muted-foreground">{note}</p> : null}

      <div className="flex flex-wrap gap-2 border-t border-border px-1 pt-3">
        <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={index <= 0} onClick={() => onMove(-1)}>
          Move up
        </Button>
        <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={index >= total - 1} onClick={() => onMove(1)}>
          Move down
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </section>
  )
}
