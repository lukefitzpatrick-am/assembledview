import { hexToArgb } from "@/lib/brand"
import { familyColour } from "@/lib/design/mediaFamilies"

export const MEDIA_TYPE_LABELS: Record<string, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digiDisplay: "Digital Display",
  digiAudio: "Digital Audio",
  digiVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  search: "Search",
  socialMedia: "Social Media",
  progDisplay: "Programmatic Display",
  progVideo: "Programmatic Video",
  progBvod: "Programmatic BVOD",
  progAudio: "Programmatic Audio",
  progOoh: "Programmatic OOH",
  influencers: "Influencers",
  production: "Production",
}

/** ARGB format (FF prefix) — used by Excel export, do NOT convert to CSS hex without auditing consumers.
 *  Values follow the media families in lib/design/mediaFamilies.ts.
 */
export const MEDIA_TYPE_COLORS: Record<string, string> = {
  television: hexToArgb(familyColour("television")),
  radio: hexToArgb(familyColour("radio")),
  newspaper: hexToArgb(familyColour("newspaper")),
  magazines: hexToArgb(familyColour("magazines")),
  ooh: hexToArgb(familyColour("ooh")),
  cinema: hexToArgb(familyColour("cinema")),
  digiDisplay: hexToArgb(familyColour("digidisplay")),
  digiAudio: hexToArgb(familyColour("digiaudio")),
  digiVideo: hexToArgb(familyColour("digivideo")),
  bvod: hexToArgb(familyColour("bvod")),
  integration: hexToArgb(familyColour("integration")),
  search: hexToArgb(familyColour("search")),
  socialMedia: hexToArgb(familyColour("socialmedia")),
  progDisplay: hexToArgb(familyColour("progdisplay")),
  progVideo: hexToArgb(familyColour("progvideo")),
  progBvod: hexToArgb(familyColour("progbvod")),
  progAudio: hexToArgb(familyColour("progaudio")),
  progOoh: hexToArgb(familyColour("progooh")),
  influencers: hexToArgb(familyColour("influencers")),
  production: hexToArgb(familyColour("production")),
}
