import { BRAND } from "@/lib/brand"

export type MediaFamily =
  | "video"
  | "social"
  | "search_display"
  | "out_of_home"
  | "audio"
  | "print"
  | "production"

export const MEDIA_FAMILY: Record<MediaFamily, { label: string; colour: string }> = {
  video: { label: "Video and TV", colour: BRAND.colour.forest },
  social: { label: "Social and creators", colour: BRAND.colour.sky },
  search_display: { label: "Search and display", colour: BRAND.colour.lime },
  out_of_home: { label: "Out of home", colour: BRAND.colour.forestLight },
  audio: { label: "Audio", colour: BRAND.colour.muted },
  print: { label: "Print", colour: BRAND.colour.contextBlack },
  production: { label: "Production and integration", colour: BRAND.colour.context },
}

/**
 * Key list for `mediaTypeTheme.colors`. `lib/utils.ts` satisfies this type.
 * A missing or extra key fails typecheck there. This module does not import `lib/utils.ts`.
 */
export const MEDIA_TYPE_FAMILY = {
  television: "video",
  bvod: "video",
  cinema: "video",
  digivideo: "video",
  progvideo: "video",
  progbvod: "video",
  socialmedia: "social",
  influencers: "social",
  search: "search_display",
  digidisplay: "search_display",
  progdisplay: "search_display",
  ooh: "out_of_home",
  progooh: "out_of_home",
  radio: "audio",
  digiaudio: "audio",
  progaudio: "audio",
  newspaper: "print",
  magazines: "print",
  production: "production",
  integration: "production",
} as const satisfies Record<string, MediaFamily>

export type MediaTypeThemeKey = keyof typeof MEDIA_TYPE_FAMILY

export function familyColour(mediaTypeThemeKey: MediaTypeThemeKey): string {
  return MEDIA_FAMILY[MEDIA_TYPE_FAMILY[mediaTypeThemeKey]].colour
}

/** Non-media series and unknown-entity fallbacks. Not a per-channel hue. */
export const BRAND_SERIES: readonly string[] = [
  BRAND.colour.forest,
  BRAND.colour.sky,
  BRAND.colour.lime,
  BRAND.colour.forestLight,
  BRAND.colour.muted,
  BRAND.colour.context,
  BRAND.colour.mutedOnBlack,
  BRAND.colour.contextBlack,
]
