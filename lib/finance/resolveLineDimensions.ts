export interface LineReportDimensions {
  mediaType: string
  publisher?: string
  buyType?: string
  format?: string
  station?: string
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digidisplay: "Digital Display",
  digitaldisplay: "Digital Display",
  digivideo: "Digital Video",
  digitalvideo: "Digital Video",
  digiaudio: "Digital Audio",
  digitalaudio: "Digital Audio",
  bvod: "BVOD",
  search: "Search",
  social: "Social",
  socialmedia: "Social",
  progdisplay: "Programmatic Display",
  programmaticdisplay: "Programmatic Display",
  progvideo: "Programmatic Video",
  programmaticvideo: "Programmatic Video",
  progbvod: "Programmatic BVOD",
  programmaticbvod: "Programmatic BVOD",
  progaudio: "Programmatic Audio",
  programmaticaudio: "Programmatic Audio",
  progooh: "Programmatic OOH",
  programmaticooh: "Programmatic OOH",
  integration: "Integration",
  influencers: "Influencers",
  production: "Production",
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.replace(/[^a-z0-9]/gi, "").toLowerCase()
}

function firstNonEmpty(sourceLine: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = sourceLine[key]
    if (value === null || value === undefined) continue
    const trimmed = String(value).trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function withOptionalAxes(
  mediaType: string,
  axes: Omit<LineReportDimensions, "mediaType">
): LineReportDimensions {
  return {
    mediaType,
    ...(axes.publisher ? { publisher: axes.publisher } : {}),
    ...(axes.buyType ? { buyType: axes.buyType } : {}),
    ...(axes.format ? { format: axes.format } : {}),
    ...(axes.station ? { station: axes.station } : {}),
  }
}

export function resolveLineDimensions(
  mediaType: string,
  sourceLine: Record<string, unknown>
): LineReportDimensions {
  const key = normalizeMediaType(mediaType)
  const canonicalMediaType = MEDIA_TYPE_LABELS[key] ?? mediaType.trim()
  const buyType = firstNonEmpty(sourceLine, ["buyType", "buy_type"])

  switch (key) {
    case "television":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["network"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["daypart", "placement"]),
        station: firstNonEmpty(sourceLine, ["station"]),
      })
    case "radio":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["network", "station"]),
        buyType,
        station: firstNonEmpty(sourceLine, ["station"]),
      })
    case "newspaper":
    case "magazines":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["publisher", "network"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["size", "ad_size", "adSize"]),
      })
    case "ooh":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["network"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["format", "type"]),
      })
    case "cinema":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["network"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["format", "duration"]),
        station: firstNonEmpty(sourceLine, ["station"]),
      })
    case "digidisplay":
    case "digitaldisplay":
    case "digivideo":
    case "digitalvideo":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["publisher", "platform", "site"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["placement", "size"]),
      })
    case "digiaudio":
    case "digitalaudio":
    case "bvod":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["publisher", "platform"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["placement"]),
      })
    case "search":
    case "social":
    case "socialmedia":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["platform"]),
        buyType,
      })
    case "progdisplay":
    case "programmaticdisplay":
    case "progvideo":
    case "programmaticvideo":
    case "progbvod":
    case "programmaticbvod":
    case "progaudio":
    case "programmaticaudio":
    case "progooh":
    case "programmaticooh":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["platform", "site"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["placement", "size"]),
      })
    case "integration":
    case "influencers":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["platform"]),
        buyType,
        format: firstNonEmpty(sourceLine, ["objective", "campaign"]),
      })
    case "production":
      return withOptionalAxes(canonicalMediaType, {
        publisher: firstNonEmpty(sourceLine, ["publisher", "network"]),
        buyType: buyType ?? "production",
        format: firstNonEmpty(sourceLine, ["description", "creative", "media_type", "mediaType"]),
      })
    default:
      return withOptionalAxes(canonicalMediaType, { buyType })
  }
}
