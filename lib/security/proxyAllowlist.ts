import "server-only"

type MethodSet = ReadonlySet<string>

const M = (...methods: string[]): MethodSet => new Set(methods)

/**
 * media_plans catch-all: first segment → allowed methods on the base path.
 * DELETE is only valid as `{segment}/{numericId}` (clearVersionChildren row deletes).
 */
export const MEDIA_PLANS_ALLOWLIST: Record<string, { base: MethodSet; withId: MethodSet }> = {
  media_plan_television:   { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_newspaper:    { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_social:       { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_radio:        { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_magazines:    { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_ooh:          { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_cinema:       { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_digi_display: { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_digi_audio:   { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_digi_video:   { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_digi_bvod:    { base: M("GET"),          withId: M("DELETE") },
  media_plan_integrations: { base: M("GET"),          withId: M("DELETE") },
  media_plan_search:       { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_prog_display: { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_prog_video:   { base: M("GET"),          withId: M("DELETE") },
  media_plan_prog_bvod:    { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_prog_audio:   { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_prog_ooh:     { base: M("GET", "POST"), withId: M("DELETE") },
  media_plan_influencers:  { base: M("GET"),          withId: M("DELETE") },
  media_plan_production:   { base: M("GET"),          withId: M("DELETE") },
  digital_audio_line_items: { base: M("GET"), withId: M() },
  prog_bvod_line_items:     { base: M("GET"), withId: M() },
  prog_audio_line_items:    { base: M("GET"), withId: M() },
  media_plan_versions:      { base: M("POST"), withId: M() },
}

/** media-details catch-all: exact single-segment path → allowed methods. */
export const MEDIA_DETAILS_ALLOWLIST: Record<string, MethodSet> = {
  tv_stations: M("GET"),
  radio_stations: M("GET"),
  newspapers: M("GET"),
  newspaper_adsizes: M("GET"),
  magazines: M("GET"),
  magazines_adsizes: M("GET"),
  audio_site: M("GET", "POST"),
  video_site: M("GET", "POST"),
  display_site: M("GET", "POST"),
  bvod_site: M("GET", "POST"),
  POST_tv_stations: M("POST"),
  POST_radio_stations: M("POST"),
  POST_newspapers: M("POST"),
  POST_newspaper_adsizes: M("POST"),
  POST_magazines: M("POST"),
  POST_magazines_adsizes: M("POST"),
}

export function checkMediaPlansProxyPath(pathSegments: string[], method: string):
  | { allowed: true }
  | { allowed: false; reason: string } {
  if (pathSegments.length === 0 || pathSegments.length > 2) {
    return { allowed: false, reason: "invalid_depth" }
  }
  const entry = MEDIA_PLANS_ALLOWLIST[pathSegments[0]]
  if (!entry) return { allowed: false, reason: "unknown_path" }
  if (pathSegments.length === 1) {
    return entry.base.has(method) ? { allowed: true } : { allowed: false, reason: "method_not_allowed" }
  }
  // depth 2: second segment must be a numeric id
  if (!/^\d+$/.test(pathSegments[1])) return { allowed: false, reason: "invalid_id" }
  return entry.withId.has(method) ? { allowed: true } : { allowed: false, reason: "method_not_allowed" }
}

export function checkMediaDetailsProxyPath(pathSegments: string[], method: string):
  | { allowed: true }
  | { allowed: false; reason: string } {
  if (pathSegments.length !== 1) return { allowed: false, reason: "invalid_depth" }
  const methods = MEDIA_DETAILS_ALLOWLIST[pathSegments[0]]
  if (!methods) return { allowed: false, reason: "unknown_path" }
  return methods.has(method) ? { allowed: true } : { allowed: false, reason: "method_not_allowed" }
}
