/**
 * Interim gate: large-format OOH (one line per panel) overwhelms the
 * non-virtualized standard card list. Prefer the virtualized expert grid.
 */

/** Interim ceiling for one ExpertCard per OOH line in the standard container.
 * Large-format ingest (`buy_granularity=panel`) routinely produces 50–300 lines;
 * above this threshold we default to expert view and suppress the card list. */
export const OOH_PANEL_LINE_EXPERT_THRESHOLD = 30

const INGEST_OOH_EXPERT_SESSION_KEY = "av-ingest-ooh-prefer-expert"

export type OohGranularityLine = {
  lineItemId?: string | null
  channel?: string | null
  attrs?: Record<string, unknown> | null
}

export type OohGranularityPanel = {
  lineItemId: string
  buyGranularity: "panel" | "pack"
}

function isOohChannel(channel: string | null | undefined): boolean {
  const c = String(channel ?? "")
    .trim()
    .toLowerCase()
  return c === "ooh" || c === "mp_ooh"
}

function granularityFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
): "panel" | "pack" | null {
  if (!attrs) return null
  const raw =
    attrs.buy_granularity ?? attrs.buyGranularity ?? attrs.ingest_buy_granularity
  if (raw === "panel" || raw === "pack") return raw
  return null
}

/**
 * Count OOH line items that are panel-granularity (large-format).
 * Prefers `attrs.buy_granularity`; falls back to panel rows when provided.
 */
export function countOohPanelGranularityLines(
  lineItems: readonly OohGranularityLine[],
  panels?: readonly OohGranularityPanel[],
): number {
  const panelGranularityByLine = new Map<string, "panel" | "pack">()
  if (panels) {
    for (const p of panels) {
      const id = String(p.lineItemId ?? "").trim()
      if (!id) continue
      // First write wins; pack rows never share a line with panel in stamp path.
      if (!panelGranularityByLine.has(id)) {
        panelGranularityByLine.set(id, p.buyGranularity)
      }
    }
  }

  let n = 0
  for (const li of lineItems) {
    if (!isOohChannel(li.channel)) continue
    const fromAttrs = granularityFromAttrs(li.attrs ?? null)
    const id = String(li.lineItemId ?? "").trim()
    const fromPanels = id ? panelGranularityByLine.get(id) : undefined
    const g = fromAttrs ?? fromPanels ?? null
    if (g === "panel") n++
  }
  return n
}

export function preferOohExpertView(panelLineCount: number): boolean {
  return panelLineCount > OOH_PANEL_LINE_EXPERT_THRESHOLD
}

export function evaluateOohExpertPreference(args: {
  lineItems: readonly OohGranularityLine[]
  panels?: readonly OohGranularityPanel[]
}): { panelLineCount: number; preferOohExpertView: boolean } {
  const panelLineCount = countOohPanelGranularityLines(
    args.lineItems,
    args.panels,
  )
  return {
    panelLineCount,
    preferOohExpertView: preferOohExpertView(panelLineCount),
  }
}

/** Persist accept-time preference for the next OOH container mount (session). */
export function writeIngestOohExpertPreference(prefer: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (prefer) {
      sessionStorage.setItem(INGEST_OOH_EXPERT_SESSION_KEY, "1")
      // Align with schedule-grid entry mode so toggles stay consistent.
      sessionStorage.setItem("av-builder-container-entry-mode", "schedule")
    } else {
      sessionStorage.removeItem(INGEST_OOH_EXPERT_SESSION_KEY)
    }
  } catch {
    // ignore quota / private mode
  }
}

/** Read and clear the one-shot ingest prefer-expert flag. */
export function consumeIngestOohExpertPreference(): boolean {
  if (typeof window === "undefined") return false
  try {
    const v = sessionStorage.getItem(INGEST_OOH_EXPERT_SESSION_KEY)
    if (v) sessionStorage.removeItem(INGEST_OOH_EXPERT_SESSION_KEY)
    return v === "1"
  } catch {
    return false
  }
}

/** Standard container: hide N cards and show summary when over the threshold. */
export function shouldShowOohLargeFormatSummary(panelLineCount: number): boolean {
  return preferOohExpertView(panelLineCount)
}
