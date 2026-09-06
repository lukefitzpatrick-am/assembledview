/**
 * Apply a captured ingest load onto the create/edit form.
 * Enabling the channel flag mounts the container; writing the same rows into
 * the hydration setter (edit: *LineItems) is the same path draft restore uses,
 * so useStableHydration does not wipe the load with an empty first paint.
 *
 * On a Partial MBA, loaded line ids are unioned into the channel's selected
 * set so they resolve approved (all-in), same as a line typed onto an
 * unlisted channel. Reset-to-all-in is unchanged.
 */

import { editorBillingStableLineItemId } from "@/lib/finance/buildEditorLineItemInputs"

export const INGEST_CHANNEL_FLAG = {
  radio: "mp_radio",
  ooh: "mp_ooh",
} as const

export const INGEST_CHANNEL_LABEL = {
  radio: "Radio",
  ooh: "OOH",
} as const

export type IngestLoadChannel = keyof typeof INGEST_CHANNEL_FLAG

type LineItems = Record<string, unknown>[]
type LineItemsUpdater = (prev: LineItems) => LineItems

export function ingestPublisherFromItems(items: LineItems): string | undefined {
  for (const item of items) {
    const attrs =
      item.attrs && typeof item.attrs === "object" && !Array.isArray(item.attrs)
        ? (item.attrs as Record<string, unknown>)
        : null
    const candidates = [
      item.publisher,
      item.source_publisher,
      item.network,
      attrs?.network,
      attrs?.source_publisher,
    ]
    for (const raw of candidates) {
      if (typeof raw === "string" && raw.trim()) return raw.trim()
    }
  }
  return undefined
}

export function formatIngestLoadNote(args: {
  count: number
  publisherName?: string | null
  label: string
}): string {
  const n = args.count
  const noun = n === 1 ? "line" : "lines"
  const source = args.publisherName?.trim() || args.label
  return `${n} ${noun} loaded from ${source}, all in scope`
}

export function ingestChannelWillSwitchOn(
  enabledMediaTypes: string[] | undefined,
  channel: IngestLoadChannel,
): boolean {
  if (!Array.isArray(enabledMediaTypes)) return false
  const want = channel.toLowerCase()
  return !enabledMediaTypes.some((t) => t.trim().toLowerCase() === want)
}

export function queueScrollToMediaSection(sectionId: string): void {
  if (typeof document === "undefined") return
  const run = () => {
    const el = document.getElementById(sectionId)
    if (!el) return
    const scroller = document.getElementById("main")
    if (scroller) {
      const offset = 18
      const nextTop =
        scroller.scrollTop +
        (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) -
        offset
      scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
      return
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(run))
  } else {
    setTimeout(run, 0)
  }
}

export function nextPartialMbaSelectionAfterIngestLoad(args: {
  selected: Record<string, string[]>
  channel: IngestLoadChannel
  nextItems: LineItems
}): Record<string, string[]> {
  const ids = args.nextItems.map((item, index) =>
    editorBillingStableLineItemId(args.channel, item, index),
  )
  const prev = args.selected[args.channel] ?? []
  const seen = new Set(prev)
  const merged = [...prev]
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(id)
  }
  return { ...args.selected, [args.channel]: merged }
}

export function applyIngestLineItemsLoad(args: {
  channel: IngestLoadChannel
  items: LineItems
  replace?: boolean
  channelEnabled: boolean
  enableChannel: () => void
  setHydrationItems?: (updater: LineItemsUpdater) => void
  setMediaItems: (updater: LineItemsUpdater) => void
  markDirty: () => void
  scrollToSection?: (sectionId: string) => void
  publisherName?: string | null
  isPartialMBA?: boolean
  setPartialMBASelectedLineItemIds?: (
    next: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>),
  ) => void
}): string {
  const replace = args.replace !== false
  let nextItems: LineItems = args.items
  const updater: LineItemsUpdater = (prev) => {
    nextItems = replace ? args.items : [...prev, ...args.items]
    return nextItems
  }
  args.setHydrationItems?.(updater)
  args.setMediaItems(updater)
  if (!args.channelEnabled) args.enableChannel()
  args.markDirty()
  if (args.isPartialMBA && args.setPartialMBASelectedLineItemIds) {
    const itemsForScope = nextItems
    args.setPartialMBASelectedLineItemIds((prev) =>
      nextPartialMbaSelectionAfterIngestLoad({
        selected: prev,
        channel: args.channel,
        nextItems: itemsForScope,
      }),
    )
  }
  const flag = INGEST_CHANNEL_FLAG[args.channel]
  args.scrollToSection?.(`media-section-${flag}`)
  return formatIngestLoadNote({
    count: args.items.length,
    label: INGEST_CHANNEL_LABEL[args.channel],
    publisherName:
      args.publisherName ?? ingestPublisherFromItems(args.items) ?? null,
  })
}
