/**
 * Shared publisher brand-colour parse.
 *
 * Accepts only `#rgb` / `#rrggbb`. Invalid or empty input never becomes a
 * plausible colour — callers must use `fallback` (always `null`).
 */
export const PUBLISHER_COLOUR_INVALID_FALLBACK = null

export type ParsedPublisherColour =
  | { ok: true; hex: string }
  | {
      ok: false
      reason: "empty" | "invalid"
      fallback: typeof PUBLISHER_COLOUR_INVALID_FALLBACK
    }

export function parsePublisherColour(
  raw: string | null | undefined,
): ParsedPublisherColour {
  if (raw == null) {
    return {
      ok: false,
      reason: "empty",
      fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
    }
  }
  const t = String(raw).trim()
  if (t === "") {
    return {
      ok: false,
      reason: "empty",
      fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
    }
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const r = t[1]
    const g = t[2]
    const b = t[3]
    return { ok: true, hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase() }
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) {
    return { ok: true, hex: t.toLowerCase() }
  }
  return {
    ok: false,
    reason: "invalid",
    fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
  }
}

/** Hex string for native `<input type="color">` / swatches, or undefined when unset/invalid. */
export function cssHexFromStored(hex: string | null | undefined): string | undefined {
  const parsed = parsePublisherColour(hex)
  return parsed.ok ? parsed.hex : undefined
}

/** Resolved brand hex, or the documented fallback (`null`) for empty/invalid. */
export function publisherColourOrFallback(
  raw: string | null | undefined,
): string | null {
  const parsed = parsePublisherColour(raw)
  return parsed.ok ? parsed.hex : parsed.fallback
}

/** Header stripe gradient from a validated hex; undefined when fallback (caller uses token stripe). */
export function publisherColourStripeBackground(
  raw: string | null | undefined,
): string | undefined {
  const hex = publisherColourOrFallback(raw)
  if (!hex) return undefined
  return `linear-gradient(to right, ${hex}99, ${hex}, ${hex}99)`
}
