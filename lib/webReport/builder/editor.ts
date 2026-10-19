import { addElement } from "@/lib/webReport/builder/layout"
import {
  WEB_REPORT_ELEMENTS,
  readLayoutChrome,
  resolveDisplay,
  resolveWidth,
  type WebDisplay,
  type WebElementId,
  type WebReportLayoutItem,
  type WebWidth,
} from "@/lib/webReport/elements"
import type { ReportPeriod } from "@/lib/webReport/periods"

/** A layout item plus a key that survives reordering, for selection and drag. */
export type BuilderEntry = { key: string; item: WebReportLayoutItem }

export const NEW_ELEMENTS: readonly WebElementId[] = ["gscTrend", "queryBubble", "queryPositions", "kpiTracker"]

export const DISPLAY_LABEL: Record<WebDisplay, string> = {
  tiles: "Tiles",
  spark: "Tiles with trend",
  bullet: "Bullet",
  combo: "Combo",
  line: "Line",
  area: "Area",
  column: "Column",
  calendar: "Calendar",
  table: "Table",
  bar: "Bar",
  donut: "Donut",
  treemap: "Treemap",
  waterfall: "Waterfall",
  bubble: "Bubble",
  histogram: "Histogram",
  text: "Text",
}

export const WIDTH_OPTIONS: readonly { width: WebWidth; label: string }[] = [
  { width: 12, label: "Full" },
  { width: 6, label: "Half" },
  { width: 4, label: "Third" },
]

const DISPLAY_NOTES: Partial<Record<WebElementId, Partial<Record<WebDisplay, string>>>> = {
  srcmed: { donut: "Donut shows share of sessions. Users are not added up." },
  queries: {
    table: "Position is the impression-weighted average for the period.",
    bar: "Position is the impression-weighted average for the period.",
  },
  location: {
    table: "(not set) stays at the bottom when Google Analytics 4 has no city.",
    bar: "(not set) stays at the bottom when Google Analytics 4 has no city.",
  },
}

export function elementNote(item: WebReportLayoutItem): string | null {
  return DISPLAY_NOTES[item.elementId]?.[resolveDisplay(item)] ?? null
}

export function displayOptions(id: WebElementId): readonly WebDisplay[] {
  return WEB_REPORT_ELEMENTS[id].displays
}

export function entriesFromLayout(layout: WebReportLayoutItem[], prefix = "el"): BuilderEntry[] {
  return layout.map((item, index) => ({ key: `${prefix}-${index}`, item }))
}

export function layoutFromEntries(entries: BuilderEntry[]): WebReportLayoutItem[] {
  return entries.map(({ item }) => {
    const out: WebReportLayoutItem = { elementId: item.elementId, settings: item.settings }
    const chrome = readLayoutChrome(item.elementId, item)
    if (chrome.display) out.display = chrome.display
    if (chrome.width) out.width = chrome.width
    return out
  })
}

export function addEntry(entries: BuilderEntry[], id: WebElementId, key: string): BuilderEntry[] {
  const [item] = addElement([], id)
  return [...entries, { key, item }]
}

export function removeEntry(entries: BuilderEntry[], key: string): BuilderEntry[] {
  return entries.filter((entry) => entry.key !== key)
}

/** Removes the last instance of an element, for the library's Remove button. */
export function removeLastOf(entries: BuilderEntry[], id: WebElementId): BuilderEntry[] {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].item.elementId === id) return removeEntry(entries, entries[index].key)
  }
  return entries
}

export function moveEntryTo(entries: BuilderEntry[], from: number, to: number): BuilderEntry[] {
  if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return entries
  const copy = entries.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}

export function moveEntryBy(entries: BuilderEntry[], key: string, delta: -1 | 1): BuilderEntry[] {
  const index = entries.findIndex((entry) => entry.key === key)
  if (index < 0) return entries
  return moveEntryTo(entries, index, index + delta)
}

function updateItem(entries: BuilderEntry[], key: string, change: (item: WebReportLayoutItem) => WebReportLayoutItem): BuilderEntry[] {
  return entries.map((entry) => (entry.key === key ? { key: entry.key, item: change(entry.item) } : entry))
}

/** A display the element does not allow is ignored. */
export function setEntryDisplay(entries: BuilderEntry[], key: string, display: WebDisplay): BuilderEntry[] {
  return updateItem(entries, key, (item) =>
    WEB_REPORT_ELEMENTS[item.elementId].displays.includes(display) ? { ...item, display } : item,
  )
}

export function setEntryWidth(entries: BuilderEntry[], key: string, width: WebWidth): BuilderEntry[] {
  return updateItem(entries, key, (item) => ({ ...item, width }))
}

export function setEntrySettings(entries: BuilderEntry[], key: string, settings: unknown): BuilderEntry[] {
  return updateItem(entries, key, (item) => ({ ...item, settings }))
}

export function entryDisplay(entry: BuilderEntry): WebDisplay {
  return resolveDisplay(entry.item)
}

export function entryWidth(entry: BuilderEntry): WebWidth {
  return resolveWidth(entry.item)
}

export function builderRequestBody(input: {
  action: "save" | "preview"
  entries: BuilderEntry[]
  brandTerms: string[]
  period: ReportPeriod
}) {
  return {
    action: input.action,
    brandTerms: input.brandTerms,
    defaultPeriod: input.period,
    layout: layoutFromEntries(input.entries),
  }
}

/** The key to select after a list change: the same key if it survived, else the nearest neighbour. */
export function nextSelection(before: BuilderEntry[], after: BuilderEntry[], selected: string | null): string | null {
  if (after.length === 0) return null
  if (selected && after.some((entry) => entry.key === selected)) return selected
  const oldIndex = selected ? before.findIndex((entry) => entry.key === selected) : -1
  const index = Math.max(0, Math.min(oldIndex, after.length - 1))
  return after[index].key
}
