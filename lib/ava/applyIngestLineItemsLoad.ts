/**
 * Apply a captured ingest load onto the create/edit form.
 * Enabling the channel flag mounts the container; writing the same rows into
 * the hydration setter (edit: *LineItems) is the same path draft restore uses,
 * so useStableHydration does not wipe the load with an empty first paint.
 */

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

export function formatIngestLoadNote(args: {
  count: number
  label: string
  turnedOn: boolean
}): string {
  const noun = args.count === 1 ? "line item" : "line items"
  const loaded = `Loaded ${args.count} ${args.label} ${noun} into the form`
  const turned = args.turnedOn
    ? ` and turned ${args.label} on for this plan`
    : ""
  return `${loaded}${turned}. Nothing is saved.`
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
}): string {
  const replace = args.replace !== false
  const updater: LineItemsUpdater = (prev) =>
    replace ? args.items : [...prev, ...args.items]
  args.setHydrationItems?.(updater)
  args.setMediaItems(updater)
  if (!args.channelEnabled) args.enableChannel()
  args.markDirty()
  const flag = INGEST_CHANNEL_FLAG[args.channel]
  args.scrollToSection?.(`media-section-${flag}`)
  return formatIngestLoadNote({
    count: args.items.length,
    label: INGEST_CHANNEL_LABEL[args.channel],
    turnedOn: !args.channelEnabled,
  })
}
