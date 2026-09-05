/**
 * MBAData for regenerate when the persisted slice path has no fee basis.
 * Totals come from the Excel adapter (DOC-3). Header date is `now`
 * (published_at on regenerate / --out).
 */

import { addGst } from "@/lib/finance/gst"
import { mbaHeaderDateLabel } from "@/lib/docs/buildMbaFromPersisted"
import { mbaDocumentFilename } from "@/lib/docs/mbaScope"
import type { MBAData } from "@/lib/generateMBA"
import type { MediaPlanHeader } from "@/lib/generateMediaPlan"
import type { MediaPlanWorkbookMbaData } from "@/lib/mediaplan/buildMediaPlanWorkbookMbaData"

export function buildMbaDataFromExplodeAdapter(args: {
  header: MediaPlanHeader
  mbaData: MediaPlanWorkbookMbaData
  now: Date
}): MBAData {
  const totals = args.mbaData.totals
  const billedExGst = totals.totals_ex_gst
  return {
    date: mbaHeaderDateLabel(args.now),
    mba_number: args.header.mbaNumber,
    campaign_name: args.header.campaignName,
    campaign_brand: args.header.brand,
    po_number: args.header.poNumber,
    media_plan_version: args.header.planVersion,
    client: {
      name: args.header.client,
      streetaddress: "",
      suburb: "",
      state: "",
      postcode: "",
    },
    campaign: {
      date_start: args.header.campaignStart,
      date_end: args.header.campaignEnd,
    },
    gross_media: args.mbaData.gross_media,
    totals: {
      gross_media: totals.gross_media,
      service_fee: totals.service_fee,
      production: totals.production,
      adserving: totals.adserving,
      totals_ex_gst: totals.totals_ex_gst,
      total_inc_gst: totals.total_inc_gst,
      billing_ex_gst: billedExGst,
      billing_inc_gst: addGst(billedExGst),
    },
    billingSchedule: [],
  }
}

export function explodeMbaFilename(header: MediaPlanHeader): string {
  return mbaDocumentFilename({
    clientName: header.client,
    campaignName: header.campaignName,
    versionNumber: header.planVersion,
    partial: false,
  })
}
