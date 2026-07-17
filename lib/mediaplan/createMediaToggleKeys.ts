/**
 * Canonical create-form media-type toggle field names.
 * Excludes mp_production and mp_fixedfee (not planner carry-through containers).
 * Shared by create page schema/defaults and planning MP_KEY_ORDER.
 */
export const CREATE_MEDIA_TOGGLE_KEYS = [
  "mp_television",
  "mp_radio",
  "mp_newspaper",
  "mp_magazines",
  "mp_ooh",
  "mp_cinema",
  "mp_digidisplay",
  "mp_digiaudio",
  "mp_digivideo",
  "mp_bvod",
  "mp_integration",
  "mp_search",
  "mp_socialmedia",
  "mp_progdisplay",
  "mp_progvideo",
  "mp_progbvod",
  "mp_progaudio",
  "mp_progooh",
  "mp_influencers",
] as const

export type CreateMediaToggleKey = (typeof CREATE_MEDIA_TOGGLE_KEYS)[number]
