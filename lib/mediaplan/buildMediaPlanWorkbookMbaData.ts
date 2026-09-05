/**
 * MBA totals block written into the media-plan Excel workbook.
 * Same construction as the create/edit generateMediaPlan path.
 *
 * Fee dollars still come from {@link computeCampaignFinancials} →
 * `mbaScopeTotals` (which uses `lib/mediaplan/burstAmounts.ts` only).
 */
import type { MbaScopeTotals } from "@/lib/finance/campaignFinancials.types"

export const MEDIA_PLAN_WORKBOOK_FLAG_TO_BILLING_KEY: Record<string, string> = {
  mp_search: "search",
  mp_socialmedia: "socialMedia",
  mp_digiaudio: "digiAudio",
  mp_digidisplay: "digiDisplay",
  mp_digivideo: "digiVideo",
  mp_bvod: "bvod",
  mp_progdisplay: "progDisplay",
  mp_progvideo: "progVideo",
  mp_progbvod: "progBvod",
  mp_progaudio: "progAudio",
  mp_progooh: "progOoh",
  mp_cinema: "cinema",
  mp_television: "television",
  mp_radio: "radio",
  mp_newspaper: "newspaper",
  mp_magazines: "magazines",
  mp_ooh: "ooh",
  mp_integration: "integration",
  mp_influencers: "influencers",
  mp_production: "production",
}

/** Flag + label rows in the same order as the create/edit mediaTypes catalogs. */
export const MEDIA_PLAN_WORKBOOK_MEDIA_TYPES: Array<{ name: string; label: string }> = [
  { name: "mp_television", label: "Television" },
  { name: "mp_radio", label: "Radio" },
  { name: "mp_newspaper", label: "Newspaper" },
  { name: "mp_magazines", label: "Magazines" },
  { name: "mp_ooh", label: "OOH" },
  { name: "mp_cinema", label: "Cinema" },
  { name: "mp_digidisplay", label: "Digital Display" },
  { name: "mp_digiaudio", label: "Digital Audio" },
  { name: "mp_digivideo", label: "Digital Video" },
  { name: "mp_bvod", label: "BVOD" },
  { name: "mp_integration", label: "Integration" },
  { name: "mp_search", label: "Search" },
  { name: "mp_socialmedia", label: "Social Media" },
  { name: "mp_progdisplay", label: "Programmatic Display" },
  { name: "mp_progvideo", label: "Programmatic Video" },
  { name: "mp_progbvod", label: "Programmatic BVOD" },
  { name: "mp_progaudio", label: "Programmatic Audio" },
  { name: "mp_progooh", label: "Programmatic OOH" },
  { name: "mp_influencers", label: "Influencers" },
  { name: "mp_production", label: "Production" },
]

export type MediaPlanWorkbookMbaData = {
  gross_media: { media_type: string; gross_amount: number }[]
  totals: {
    gross_media: number
    service_fee: number
    production: number
    adserving: number
    totals_ex_gst: number
    total_inc_gst: number
  }
}

export function buildMediaPlanWorkbookMbaData(args: {
  mediaTypes: Array<{ name: string; label: string }>
  formFlags: Record<string, unknown>
  mediaKeyMap?: Record<string, string>
  campaignFinancialsMediaByKey: Record<string, number>
  mbaScopeTotals: MbaScopeTotals
}): MediaPlanWorkbookMbaData {
  const mediaKeyMap = args.mediaKeyMap ?? MEDIA_PLAN_WORKBOOK_FLAG_TO_BILLING_KEY
  const gross_media = args.mediaTypes
    .filter((medium) => medium.name !== "mp_production")
    .filter((medium) => Boolean(args.formFlags[medium.name]))
    .map((medium) => {
      const billingKey = mediaKeyMap[medium.name]
      return {
        media_type: medium.label,
        gross_amount:
          billingKey !== undefined
            ? (args.campaignFinancialsMediaByKey[billingKey] ?? 0)
            : 0,
      }
    })

  const core = args.mbaScopeTotals
  return {
    gross_media,
    totals: {
      gross_media: core.grossMedia,
      service_fee: core.fee,
      production: core.production,
      adserving: core.adServing,
      totals_ex_gst: core.nettExGst,
      total_inc_gst: core.nettIncGst,
    },
  }
}
