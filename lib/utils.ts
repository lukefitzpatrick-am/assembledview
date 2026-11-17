import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

import { familyColour, type MediaTypeThemeKey } from "@/lib/design/mediaFamilies"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

