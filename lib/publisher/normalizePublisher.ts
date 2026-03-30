import type { Publisher } from "@/lib/types/publisher"

function normalizePublisherColour(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  return s === "" ? null : s
}

const LEGACY_COMMS: [legacy: keyof Publisher, canonical: string][] = [
  ["pub_radio_comms", "radio_comms"],
  ["pub_newspaper_comms", "newspaper_comms"],
  ["pub_television_comms", "television_comms"],
  ["pub_magazines_comms", "magazines_comms"],
  ["pub_ooh_comms", "ooh_comms"],
  ["pub_cinema_comms", "cinema_comms"],
  ["pub_digidisplay_comms", "digidisplay_comms"],
  ["pub_digiaudio_comms", "digiaudio_comms"],
  ["pub_digivideo_comms", "digivideo_comms"],
  ["pub_bvod_comms", "bvod_comms"],
  ["pub_integration_comms", "integration_comms"],
  ["pub_search_comms", "search_comms"],
  ["pub_socialmedia_comms", "socialmedia_comms"],
  ["pub_progdisplay_comms", "progdisplay_comms"],
  ["pub_progvideo_comms", "progvideo_comms"],
  ["pub_progbvod_comms", "progbvod_comms"],
  ["pub_progaudio_comms", "progaudio_comms"],
  ["pub_progooh_comms", "progooh_comms"],
  ["pub_influencers_comms", "influencers_comms"],
]

/** Merge legacy `pub_*_comms` into canonical keys for forms and PUT body. */
export function normalizePublisherRecord(raw: Publisher): Publisher {
  const out = { ...raw } as Record<string, unknown>
  for (const [legacy, canonical] of LEGACY_COMMS) {
    const leg = raw[legacy]
    const cur = out[canonical]
    if (leg != null && leg !== "" && (cur === undefined || cur === null || cur === "")) {
      out[canonical] = leg
    }
    delete out[legacy as string]
  }
  out.publisher_colour = normalizePublisherColour(out.publisher_colour)
  return out as unknown as Publisher
}

/** Ensure Xano receives canonical comms field names (drop legacy-only keys). */
export function bodyForPublisherPut(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data }
  for (const [legacy] of LEGACY_COMMS) {
    delete out[legacy as string]
  }
  if (Object.prototype.hasOwnProperty.call(data, "publisher_colour")) {
    out.publisher_colour = normalizePublisherColour(data.publisher_colour)
  }
  return out
}
