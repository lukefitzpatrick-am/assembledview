import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

import { familyColour, type MediaTypeThemeKey } from "@/lib/design/mediaFamilies"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert `#rgb` / `#rrggbb` to `rgba(r,g,b,a)` for gradients and overlays. */
export function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.trim().replace(/^#/, "")
  const expanded =
    trimmed.length === 3 ? trimmed.split("").map((c) => c + c).join("") : trimmed
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(79, 143, 203, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const mediaTypeTheme = {
  colors: {
    television: familyColour("television"),
    radio: familyColour("radio"),
    newspaper: familyColour("newspaper"),
    magazines: familyColour("magazines"),
    ooh: familyColour("ooh"),
    cinema: familyColour("cinema"),
    digidisplay: familyColour("digidisplay"),
    digiaudio: familyColour("digiaudio"),
    digivideo: familyColour("digivideo"),
    bvod: familyColour("bvod"),
    integration: familyColour("integration"),
    search: familyColour("search"),
    socialmedia: familyColour("socialmedia"),
    progdisplay: familyColour("progdisplay"),
    progvideo: familyColour("progvideo"),
    progbvod: familyColour("progbvod"),
    progaudio: familyColour("progaudio"),
    progooh: familyColour("progooh"),
    influencers: familyColour("influencers"),
    production: familyColour("production"),
  } satisfies Record<MediaTypeThemeKey, string>,
}

