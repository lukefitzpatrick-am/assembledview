/** Display labels for publisher `pub_*` flag suffixes (and matching slugs). */
const MEDIA_TYPE_LABELS: Record<string, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digidisplay: "Digital Display",
  digiaudio: "Digital Audio",
  digivideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  search: "Search",
  socialmedia: "Social Media",
  progdisplay: "Programmatic Display",
  progvideo: "Programmatic Video",
  progbvod: "Programmatic BVOD",
  progaudio: "Programmatic Audio",
  progooh: "Programmatic OOH",
  influencers: "Influencers",
}

/**
 * Normalised keys from human-readable names (e.g. `lib/api/dashboard` campaign rows)
 * → canonical slug keys used in `MEDIA_TYPE_LABELS` / `mediaTypeTheme.colors`.
 */
const NORMALIZED_DISPLAY_TO_SLUG: Record<string, string> = {
  digitaldisplay: "digidisplay",
  digitalaudio: "digiaudio",
  digitalvideo: "digivideo",
  programmaticdisplay: "progdisplay",
  programmaticvideo: "progvideo",
  programmaticbvod: "progbvod",
  programmaticaudio: "progaudio",
  programmaticooh: "progooh",
}

/**
 * Collapse whitespace/underscores/hyphens and map display-style strings to theme slugs.
 */
export function normalizeCampaignMediaTypeKey(raw: string): string {
  const compact = raw.toLowerCase().replace(/[\s_-]/g, "")
  if (compact in MEDIA_TYPE_LABELS) return compact
  return NORMALIZED_DISPLAY_TO_SLUG[compact] ?? compact
}

