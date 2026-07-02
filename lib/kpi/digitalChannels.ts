/** Resolver / workbook keys for digital media in KPI resolution and fan-out. */
export const DIGITAL_KPI_MEDIA_TYPES = [
  "search",
  "socialMedia",
  "bvod",
  "digiVideo",
  "digiDisplay",
  "digiAudio",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
  "integration",
] as const

export type DigitalKpiMediaType = (typeof DIGITAL_KPI_MEDIA_TYPES)[number]
