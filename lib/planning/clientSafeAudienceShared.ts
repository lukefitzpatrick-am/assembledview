/** Pure helpers for client-safe planned-audience payloads (safe for unit tests). */

export function buildDefinitionLine(opts: {
  segmentName: string
  states: string[]
  ageBands: string[]
  gender: string
}): string {
  const lens = opts.segmentName.trim()
    ? `${opts.segmentName.trim()} lens`
    : "Audience lens"
  return [
    lens,
    statesLine(opts.states),
    ageLine(opts.ageBands),
    genderLabel(opts.gender),
  ].join(" · ")
}

function genderLabel(gender: string | undefined): string {
  if (!gender || gender === "all") return "all genders"
  if (gender === "female") return "female"
  if (gender === "male") return "male"
  return "all genders"
}

function ageLine(bands: string[]): string {
  if (bands.length === 0) return "all ages"
  if (bands.length === 1) return bands[0]!
  const sorted = [...bands]
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const lo = first.split("-")[0] ?? first
  const hi = last.includes("+") ? last : (last.split("-")[1] ?? last)
  return `${lo}–${hi}`
}

function statesLine(states: string[]): string {
  if (states.length === 0) return "NAT"
  if (states.includes("NAT") && states.length === 1) return "National"
  return states.join(" + ")
}

/** Keys that must never appear on the client-safe network payload. */
export const CLIENT_SAFE_FORBIDDEN_KEYS = [
  "definition_json",
  "budget",
  "bench",
  "engine_params",
  "weights",
  "cpm",
  "attn",
  "brand_effect",
  "direct_effect",
  "created_by_email",
  "clients_id",
] as const

/**
 * Resolve PATCH fields for planning audiences.
 * Detach (null/empty mba) always clears client_visible.
 */
export function resolveAudiencePatchInput(input: {
  mba_number?: string | null
  client_visible?: boolean
  name?: string
}): {
  mba_number?: string | null
  client_visible?: boolean
  name?: string
} {
  const patch: {
    mba_number?: string | null
    client_visible?: boolean
    name?: string
  } = {}

  if ("mba_number" in input) {
    if (input.mba_number == null || input.mba_number === "") {
      patch.mba_number = null
      patch.client_visible = false
    } else {
      const trimmed = String(input.mba_number).trim()
      if (!trimmed) {
        patch.mba_number = null
        patch.client_visible = false
      } else {
        patch.mba_number = trimmed
      }
    }
  }

  if (
    typeof input.client_visible === "boolean" &&
    patch.client_visible === undefined
  ) {
    patch.client_visible = input.client_visible
  }

  if (typeof input.name === "string" && input.name.trim()) {
    patch.name = input.name.trim()
  }

  return patch
}
