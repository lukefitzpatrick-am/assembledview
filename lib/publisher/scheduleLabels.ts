/** Maps publisher pub_* flags to delivery schedule `mediaType` labels (media plan editor). */
export const PUB_FLAG_TO_SCHEDULE_LABEL: Record<string, string> = {
  pub_television: "Television",
  pub_radio: "Radio",
  pub_newspaper: "Newspaper",
  pub_magazines: "Magazines",
  pub_ooh: "OOH",
  pub_cinema: "Cinema",
  pub_digidisplay: "Digital Display",
  pub_digiaudio: "Digital Audio",
  pub_digivideo: "Digital Video",
  pub_bvod: "BVOD",
  pub_integration: "Integration",
  pub_search: "Search",
  pub_socialmedia: "Social Media",
  pub_progdisplay: "Programmatic Display",
  pub_progvideo: "Programmatic Video",
  pub_progbvod: "Programmatic BVOD",
  pub_progaudio: "Programmatic Audio",
  pub_progooh: "Programmatic OOH",
  pub_influencers: "Influencers",
}

/** `pub_*` suffix → same strings as client `/dashboard` campaign cards (`lib/api/dashboard.ts`). */
export const MEDIA_TYPE_SLUG_TO_DASHBOARD_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(PUB_FLAG_TO_SCHEDULE_LABEL).map(([flag, label]) => [flag.replace(/^pub_/, ""), label])
) as Record<string, string>

export function buildAllowedScheduleLabels(publisher: Record<string, unknown>): Set<string> {
  const s = new Set<string>()
  for (const [flag, label] of Object.entries(PUB_FLAG_TO_SCHEDULE_LABEL)) {
    if (publisher[flag]) s.add(label)
  }
  return s
}

/** KPI family key -> pub_* flag on publisher record */
export const KPI_FAMILY_PUB_FLAG: Record<string, string> = {
  digitaldisplay: "pub_digidisplay",
  digitalvideo: "pub_digivideo",
  digitalaudio: "pub_digiaudio",
  bvod: "pub_bvod",
  search: "pub_search",
  socialmedia: "pub_socialmedia",
  progdisplay: "pub_progdisplay",
  progvideo: "pub_progvideo",
  progbvod: "pub_progbvod",
  progaudio: "pub_progaudio",
}

export const KPI_FAMILY_LABELS: Record<string, string> = {
  digitaldisplay: "Digital Display",
  digitalvideo: "Digital Video",
  digitalaudio: "Digital Audio",
  bvod: "BVOD",
  search: "Search",
  socialmedia: "Social Media",
  progdisplay: "Programmatic Display",
  progvideo: "Programmatic Video",
  progbvod: "Programmatic BVOD",
  progaudio: "Programmatic Audio",
}

export const KPI_METRIC_KEYS = ["cpm", "cpc", "cpv", "ctr", "vtr", "frequency"] as const
