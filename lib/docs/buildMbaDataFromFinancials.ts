/**
 * MBAData for a publish dry-run. Totals come from in-memory financials + slice,
 * never from a client-posted total. draft: true; no checksum footer.
 */
import { format, parseISO } from "date-fns"

import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { addGst } from "@/lib/finance/gst"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import type { MBAData } from "@/lib/generateMBA"

export type DraftMbaClientAddress = {
  name?: string
  streetaddress?: string
  suburb?: string
  state?: string
  postcode?: string
}

function formatDateDdMmYyyy(raw: unknown): string {
  if (raw == null || raw === "") return ""
  const s = String(raw).trim()
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return format(parseISO(s.slice(0, 10)), "dd/MM/yyyy")
    }
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy")
  } catch {
    /* fall through */
  }
  return s
}

export function buildMbaDataFromFinancials(args: {
  mbaNumber: string
  campaignName: string | null | undefined
  brand: string | null | undefined
  poNumber: string | null | undefined
  versionNumber: number
  campaignStartDate: string | null | undefined
  campaignEndDate: string | null | undefined
  clientName: string
  clientAddress?: DraftMbaClientAddress
  financials: CampaignFinancials
  slice: ApprovedSlice
  now?: Date
}): MBAData {
  const { financials } = args
  const byType = new Map<string, number>()
  for (const line of financials.perLine) {
    if (line.flags.excluded) continue
    if (line.mediaType === "production") continue
    const label = MEDIA_TYPE_LABELS[line.mediaType] ?? line.mediaType
    byType.set(label, (byType.get(label) ?? 0) + line.media)
  }
  const gross_media = [...byType.entries()].map(([media_type, gross_amount]) => ({
    media_type,
    gross_amount,
  }))
  const totals = financials.mbaScopeTotals
  const billedExGst =
    financials.reconciliation?.billableMbaExGst ?? totals.nettExGst
  const addr = args.clientAddress ?? {}
  void args.slice
  return {
    date: formatDateDdMmYyyy(getMelbourneTodayISO(args.now)),
    mba_number: args.mbaNumber,
    campaign_name: String(args.campaignName ?? ""),
    campaign_brand: String(args.brand ?? ""),
    po_number: String(args.poNumber ?? ""),
    media_plan_version: String(args.versionNumber),
    client: {
      name: addr.name || args.clientName,
      streetaddress: String(addr.streetaddress ?? ""),
      suburb: String(addr.suburb ?? ""),
      state: String(addr.state ?? ""),
      postcode: String(addr.postcode ?? ""),
    },
    campaign: {
      date_start: formatDateDdMmYyyy(args.campaignStartDate),
      date_end: formatDateDdMmYyyy(args.campaignEndDate),
    },
    gross_media,
    totals: {
      gross_media: totals.grossMedia,
      service_fee: totals.fee,
      production: totals.production,
      adserving: totals.adServing,
      totals_ex_gst: totals.nettExGst,
      total_inc_gst: totals.nettIncGst ?? addGst(totals.nettExGst),
      billing_ex_gst: billedExGst,
      billing_inc_gst: addGst(billedExGst),
    },
    billingSchedule: financials.billingSchedule.map((m) => ({
      monthYear: m.monthYear,
      totalAmount: m.totalAmount,
    })),
    draft: true,
  }
}
