import "server-only"

type MethodSet = ReadonlySet<string>

const M = (...methods: string[]): MethodSet => new Set(methods)

/**
 * media-details catch-all (`/api/media-details/[...path]`).
 *
 * Staff-only (admin). Reference GETs feed media-plan containers; POSTs
 * are create* helpers in lib/api.ts. No client dashboard caller. Reads and
 * writes are Postgres. (The media_plans catch-all needs no allowlist: its
 * writes return 410 and its GETs are channel reads; the unused
 * MEDIA_PLANS_ALLOWLIST and its checker were removed in B6.)
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

export function checkMediaDetailsProxyPath(pathSegments: string[], method: string):
  | { allowed: true }
  | { allowed: false; reason: string } {
  if (pathSegments.length !== 1) return { allowed: false, reason: "invalid_depth" }
  const methods = MEDIA_DETAILS_ALLOWLIST[pathSegments[0]]
  if (!methods) return { allowed: false, reason: "unknown_path" }
  return methods.has(method) ? { allowed: true } : { allowed: false, reason: "method_not_allowed" }
}
