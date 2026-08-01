/**
 * Form helpers for publisher brand colour.
 * Parsing lives in `publisherColour.ts` — all renderers share that helper.
 */
import {
  cssHexFromStored,
  parsePublisherColour,
  PUBLISHER_COLOUR_INVALID_FALLBACK,
} from "@/lib/publisher/publisherColour"

/** Default / empty state for native `<input type="color">` when stored value is missing or invalid. */
export const NATIVE_COLOR_INPUT_FALLBACK = "#c4c4c4"

export function normalizeDefaultPublisherColour(raw: string | null | undefined): string | null {
  const parsed = parsePublisherColour(raw)
  return parsed.ok ? parsed.hex : PUBLISHER_COLOUR_INVALID_FALLBACK
}

export { cssHexFromStored, parsePublisherColour, PUBLISHER_COLOUR_INVALID_FALLBACK }
