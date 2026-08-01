import type { LineChannel } from "@/db/schema"
import { LINE_CHANNELS } from "@/db/schema"

/**
 * Map editor / billing `mediaType` keys (and common aliases) onto consolidated
 * `line_channel` enum values used by `savePlanVersion` / `line_items`.
 */
const UI_MEDIA_TYPE_TO_CHANNEL: Record<string, LineChannel> = {
  television: "television",
  radio: "radio",
  newspaper: "newspaper",
  magazines: "magazines",
  ooh: "ooh",
  cinema: "cinema",
  digiDisplay: "digi_display",
  digitalDisplay: "digi_display",
  digiAudio: "digi_audio",
  digitalAudio: "digi_audio",
  digiVideo: "digi_video",
  digitalVideo: "digi_video",
  bvod: "digi_bvod",
  digiBvod: "digi_bvod",
  digi_bvod: "digi_bvod",
  integration: "integrations",
  integrations: "integrations",
  search: "search",
  socialMedia: "social",
  social: "social",
  progDisplay: "prog_display",
  progVideo: "prog_video",
  progBvod: "prog_bvod",
  progBVOD: "prog_bvod",
  progAudio: "prog_audio",
  progOoh: "prog_ooh",
  progOOH: "prog_ooh",
  influencers: "influencers",
  production: "production",
}

const CHANNEL_SET = new Set<string>(LINE_CHANNELS)

export function mapUiMediaTypeToLineChannel(
  mediaType: string
): LineChannel | null {
  const raw = String(mediaType ?? "").trim()
  if (!raw) return null
  if (CHANNEL_SET.has(raw)) return raw as LineChannel
  const mapped = UI_MEDIA_TYPE_TO_CHANNEL[raw]
  if (mapped) return mapped
  // snake_case / case-insensitive fallback
  const lower = raw.toLowerCase()
  for (const [k, v] of Object.entries(UI_MEDIA_TYPE_TO_CHANNEL)) {
    if (k.toLowerCase() === lower) return v
  }
  return null
}
