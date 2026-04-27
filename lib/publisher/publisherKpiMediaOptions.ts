import { MEDIA_TYPE_OPTIONS as ALL_MEDIA_TYPE_OPTIONS } from "@/lib/kpi/types"
import type { Publisher } from "@/lib/types/publisher"

/** Maps `MEDIA_TYPE_OPTIONS[].value` to the publisher `pub_*` flag that must be true. */
const MEDIA_SLUG_TO_PUB_FLAG: Record<string, keyof Publisher> = {
  television: "pub_television",
  radio: "pub_radio",
  newspaper: "pub_newspaper",
  magazines: "pub_magazines",
  ooh: "pub_ooh",
  cinema: "pub_cinema",
  digitalDisplay: "pub_digidisplay",
  digitalAudio: "pub_digiaudio",
  digitalVideo: "pub_digivideo",
  bvod: "pub_bvod",
  integration: "pub_integration",
  search: "pub_search",
  socialMedia: "pub_socialmedia",
  progDisplay: "pub_progdisplay",
  progVideo: "pub_progvideo",
  progBvod: "pub_progbvod",
  progAudio: "pub_progaudio",
  progOoh: "pub_progooh",
  influencers: "pub_influencers",
}

export type MediaTypeOption = (typeof ALL_MEDIA_TYPE_OPTIONS)[number]

/** Media types this publisher can sell (for KPI row combobox). Omits e.g. `production` (no pub flag). */
export function mediaTypeComboboxOptionsForPublisher(publisher: Publisher): MediaTypeOption[] {
  return ALL_MEDIA_TYPE_OPTIONS.filter((o) => {
    const flag = MEDIA_SLUG_TO_PUB_FLAG[o.value]
    if (!flag) return false
    return Boolean(publisher[flag])
  })
}

/**
 * Publishers that have the given `MEDIA_TYPE_OPTIONS` slug enabled (`pub_*`).
 * Slugs without a flag (e.g. `production`) return the full list so KPI rows can still be edited.
 */
export function filterPublishersWithMediaTypeSlug(
  publishers: Publisher[],
  mediaSlug: string,
): Publisher[] {
  const flag = MEDIA_SLUG_TO_PUB_FLAG[mediaSlug]
  if (!flag) return publishers
  return publishers.filter((p) => Boolean(p[flag]))
}
