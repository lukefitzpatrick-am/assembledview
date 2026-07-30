import "server-only"

type MethodSet = ReadonlySet<string>

const M = (...methods: string[]): MethodSet => new Set(methods)

/**
 * media_plans catch-all (`/api/media_plans/[...path]`).
 *
 * Every entry is staff-only (admin|manager) at the route gate — no client surface
 * calls this proxy (edit/create + replaceChannelLineItems only). Dies with Xano
 * channel reads at T6.
 *
 * DELETE is only valid as `{segment}/{numericId}` (replaceChannelLineItems /
 * clearVersionChildren row deletes — clearVersionChildren itself is unused in
 * production but the DELETE shape remains for replace).
 */
export const MEDIA_PLANS_ALLOWLIST: Record<string, { base: MethodSet; withId: MethodSet }> = {
  // consumer: replaceChannelLineItems + LINE_ITEM_BROWSER_API_PATH / dedicated-route
  //   siblings; why: browser Xano channel CRUD; death: T6
  media_plan_television: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(newspaper→dedicated);
  //   death: T6
  media_plan_newspaper: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + social dedicated GET; death: T6
  media_plan_social: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(radio→catch-all); death: T6
  media_plan_radio: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(magazines); death: T6
  media_plan_magazines: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(ooh); death: T6
  media_plan_ooh: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + cinema dedicated GET; death: T6
  media_plan_cinema: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(digitalDisplay); death: T6
  media_plan_digi_display: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(digitalAudio); death: T6
  media_plan_digi_audio: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(digitalVideo); death: T6
  media_plan_digi_video: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + digi-bvod dedicated GET; death: T6
  media_plan_digi_bvod: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + integration dedicated GET; death: T6
  media_plan_integrations: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + search dedicated GET; death: T6
  media_plan_search: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + prog-display dedicated GET; death: T6
  media_plan_prog_display: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + prog-video dedicated GET; death: T6
  media_plan_prog_video: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(progBvod); death: T6
  media_plan_prog_bvod: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + fetchLineItemsFromApi(progAudio); death: T6
  media_plan_prog_audio: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + prog-ooh dedicated GET; death: T6
  media_plan_prog_ooh: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + influencers dedicated GET; death: T6
  media_plan_influencers: { base: M("GET", "POST"), withId: M("DELETE") },
  // consumer: replaceChannelLineItems + production dedicated GET; death: T6
  media_plan_production: { base: M("GET", "POST"), withId: M("DELETE") },
}

/**
 * media-details catch-all (`/api/media-details/[...path]`).
 *
 * Staff-only (admin|manager). Reference GETs feed media-plan containers; POSTs
 * are create* helpers in lib/api.ts. No client dashboard caller. Reference GETs
 * flip with DATA_BACKEND reference cutover; POST create endpoints die when
 * admin reference writes move off Xano (or never if kept as Xano-only).
 */
export const MEDIA_DETAILS_ALLOWLIST: Record<string, MethodSet> = {
  // consumer: getTVStations → TelevisionContainer; death: reference cutover / T6-adjacent
  tv_stations: M("GET"),
  // consumer: getRadioStations → RadioContainer; death: reference cutover
  radio_stations: M("GET"),
  // consumer: getNewspapers → NewspaperContainer; death: reference cutover
  newspapers: M("GET"),
  // consumer: getNewspapersAdSizes; death: reference cutover
  newspaper_adsizes: M("GET"),
  // consumer: getMagazines → MagazinesContainer; death: reference cutover
  magazines: M("GET"),
  // consumer: getMagazinesAdSizes; death: reference cutover
  magazines_adsizes: M("GET"),
  // consumer: getAudioSites / createAudioSite → DigitalAudioContainer; death: reference cutover
  audio_site: M("GET", "POST"),
  // consumer: getVideoSites / createVideoSite; death: reference cutover
  video_site: M("GET", "POST"),
  // consumer: getDisplaySites / createDisplaySite; death: reference cutover
  display_site: M("GET", "POST"),
  // consumer: getBvodSites / createBvodSite; death: reference cutover
  bvod_site: M("GET", "POST"),
  // consumer: createTVStation (browser → /api/media-details/POST_*); death: never or admin write migration
  POST_tv_stations: M("POST"),
  // consumer: createRadioStation; death: never or admin write migration
  POST_radio_stations: M("POST"),
  // consumer: createNewspaper; death: never or admin write migration
  POST_newspapers: M("POST"),
  // consumer: createNewspaperAdSize; death: never or admin write migration
  POST_newspaper_adsizes: M("POST"),
  // consumer: createMagazine; death: never or admin write migration
  POST_magazines: M("POST"),
  // consumer: createMagazineAdSize; death: never or admin write migration
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
