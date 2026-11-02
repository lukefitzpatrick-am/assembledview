/**
 * FROZEN COPY, tests only. The media plan editor's own saved-billing parser
 * as it was before B4 (edit/page.tsx `parseSavedBillingSchedulePayload`,
 * removed 2 Nov 2026). Kept so the parity test can prove the switch to the
 * shared lib parser changes nothing except the three decided rows (P5): no
 * search/social fee estimate, minus signs kept. Do not import from app code.
 */
// @ts-nocheck
import { legacyMonthFeeFromNetMedia } from "@/lib/mediaplan/legacyMonthFeeEstimate"
import { hydratePartialMbaFromSavedMetadata, type PartialApprovalMetadata } from "@/lib/mediaplan/partialMba"
import type { BillingMonth, BillingLineItem as BillingLineItemType } from "@/lib/billing/types"

function normalizeBillingScheduleToArray(raw: unknown): any[] | null {
  if (raw == null || raw === "") return null
  let v: any = raw
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return null
    try {
      v = JSON.parse(t)
    } catch {
      return null
    }
  }
  if (Array.isArray(v)) return v.length > 0 ? v : null
  if (v && typeof v === "object" && Array.isArray((v as any).months)) {
    const m = (v as any).months
    return m.length > 0 ? m : null
  }
  return null
}

const parseMoneySaved = (val: unknown) =>
  parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0

function optionalSavedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function optionalSavedNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * Parse persisted billingSchedule JSON from `media_plan_versions` into `BillingMonth[]` for hydrate â†’ working/saved.
 * (Fees only affect search/social fee estimate when saved feeTotal absent.)
 */
function parseSavedBillingSchedulePayload(
  billingSchedule: unknown,
  fees: { searchFee: number; socialFee: number }
): {
  months: BillingMonth[]
  billingTotalFormatted: string
  partial:
    | {
        hydrate: ReturnType<typeof hydratePartialMbaFromSavedMetadata>
        metadata: PartialApprovalMetadata
      }
    | null
} | null {
  const parsed = normalizeBillingScheduleToArray(billingSchedule)
  if (!parsed) return null

  // C1 BillingMonth shape (mediaTotal/mediaCosts, no mediaTypes): preserve headers.
  // Rebuilding via the mediaTypes path zeroes mediaCosts while keeping mediaTotal from
  // totalAmount−fees; append then seeds the $ line again → doubled subtotal vs columns.
  const sample = parsed[0] as Record<string, unknown> | undefined
  const sampleMediaTypes = sample?.mediaTypes ?? (sample as { media_types?: unknown } | undefined)?.media_types
  if (
    sample &&
    typeof sample === "object" &&
    typeof sample.monthYear === "string" &&
    !Array.isArray(sampleMediaTypes) &&
    ("mediaTotal" in sample || "mediaCosts" in sample)
  ) {
    const months = JSON.parse(JSON.stringify(parsed)) as BillingMonth[]
    const total = months.reduce((sum, m) => {
      return sum + (parseFloat(String(m.totalAmount || "$0").replace(/[^0-9.]/g, "")) || 0)
    }, 0)
    const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
    const partialEntry = parsed.find((e: any) => e?.partialApproval ?? e?.partial_approval)
    const savedPartial = (partialEntry?.partialApproval ?? partialEntry?.partial_approval) as
      | PartialApprovalMetadata
      | undefined
    const partial =
      savedPartial?.isPartial === true
        ? { hydrate: hydratePartialMbaFromSavedMetadata(savedPartial), metadata: savedPartial }
        : null
    return {
      months,
      billingTotalFormatted: currencyFormatter.format(total),
      partial,
    }
  }

  const { searchFee, socialFee } = fees
  const currencyFormatter = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
  const mediaTypeLabelMap: Record<string, string> = {
    Search: "search",
    "Social Media": "socialMedia",
    Television: "television",
    Radio: "radio",
    Newspaper: "newspaper",
    Magazines: "magazines",
    OOH: "ooh",
    Cinema: "cinema",
    "Digital Display": "digiDisplay",
    "Digital Audio": "digiAudio",
    "Digital Video": "digiVideo",
    BVOD: "bvod",
    Integration: "integration",
    "Programmatic Display": "progDisplay",
    "Programmatic Video": "progVideo",
    "Programmatic BVOD": "progBvod",
    "Programmatic Audio": "progAudio",
    "Programmatic OOH": "progOoh",
    Influencers: "influencers",
  }

  const parsedBillingMonthRows: BillingMonth[] = parsed.map((entry: any) => {
    const monthYear =
      entry.monthYear || entry.month_year || entry.month || entry.month_label || ""
    const mediaCosts: BillingMonth["mediaCosts"] = {
      search: "$0.00",
      socialMedia: "$0.00",
      television: "$0.00",
      radio: "$0.00",
      newspaper: "$0.00",
      magazines: "$0.00",
      ooh: "$0.00",
      cinema: "$0.00",
      digiDisplay: "$0.00",
      digiAudio: "$0.00",
      digiVideo: "$0.00",
      bvod: "$0.00",
      integration: "$0.00",
      progDisplay: "$0.00",
      progVideo: "$0.00",
      progBvod: "$0.00",
      progAudio: "$0.00",
      progOoh: "$0.00",
      influencers: "$0.00",
      production: "$0.00",
    }

    let totalMedia = 0
    let totalFee = 0
    const lineItems: Record<string, BillingLineItemType[]> = {}

    const mediaTypesRaw = entry.mediaTypes ?? entry.media_types
    if (mediaTypesRaw && Array.isArray(mediaTypesRaw)) {
      mediaTypesRaw.forEach((mediaType: any) => {
        const label =
          mediaType.mediaType ||
          mediaType.media_type ||
          mediaType.type ||
          mediaType.name ||
          ""
        const mediaKey = mediaTypeLabelMap[label] || String(label).toLowerCase()

        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          const mediaTotal = mediaType.lineItems.reduce((sum: number, item: any) => {
            const amountStr = item.amount || item.__amountValue || "0"
            const amount =
              typeof amountStr === "string"
                ? parseFloat(amountStr.replace(/[^0-9.]/g, ""))
                : amountStr
            return sum + (amount || 0)
          }, 0)

          mediaCosts[mediaKey] = currencyFormatter.format(mediaTotal)
          totalMedia += mediaTotal

          let feePercentage = 0
          if (mediaKey === "search") feePercentage = searchFee
          else if (mediaKey === "socialMedia") feePercentage = socialFee
          const feeAmount = legacyMonthFeeFromNetMedia(mediaTotal, feePercentage)
          totalFee += feeAmount

          lineItems[mediaKey] = mediaType.lineItems.map((item: any) => {
            const amount =
              parseFloat((item.amount || item.__amountValue || "0").toString().replace(/[^0-9.]/g, "")) || 0
            const monthlyAmounts: Record<string, number> = {}
            parsed.forEach((e: any) => {
              const m = e.monthYear || e.month || ""
              monthlyAmounts[m] = m === monthYear ? amount : 0
            })

            const rawLiId = item.lineItemId ?? item.line_item_id
            const billingMode =
              item.billingMode === "auto" || item.billingMode === "manual"
                ? item.billingMode
                : undefined
            const mediaAmount = optionalSavedNumber(item.mediaAmount)
            const feeAmount = optionalSavedNumber(item.feeAmount)
            const mediaTypeValue = optionalSavedString(item.mediaType)
            const publisher = optionalSavedString(item.publisher)
            const buyType = optionalSavedString(item.buyType)
            const format = optionalSavedString(item.format)
            const station = optionalSavedString(item.station)
            const feeMonthlyAmounts =
              feeAmount !== undefined
                ? Object.fromEntries(parsed.map((e: any) => {
                    const m = String(e.monthYear ?? e.month ?? "").trim()
                    return [m, m === monthYear ? feeAmount : 0]
                  }))
                : undefined
            return {
              id:
                rawLiId != null && String(rawLiId).trim() !== ""
                  ? String(rawLiId)
                  : `${mediaKey}-${item.header1}-${item.header2}`,
              header1: item.header1 || "",
              header2: item.header2 || "",
              monthlyAmounts,
              totalAmount: amount,
              ...(billingMode ? { billingMode } : {}),
              ...(mediaTypeValue ? { mediaType: mediaTypeValue } : {}),
              ...(publisher ? { publisher } : {}),
              ...(buyType ? { buyType } : {}),
              ...(format ? { format } : {}),
              ...(station ? { station } : {}),
              ...(mediaAmount !== undefined ? { mediaAmount } : {}),
              ...(feeAmount !== undefined ? { feeAmount, feeMonthlyAmounts, totalFeeAmount: feeAmount } : {}),
              ...(item.clientPaysForMedia === true ? { clientPaysForMedia: true } : {}),
            }
          })
        }
      })
    }

    let finalFeeTotal = totalFee
    if (entry.feeTotal) {
      const savedFeeTotal = parseFloat(entry.feeTotal.toString().replace(/[^0-9.]/g, "")) || 0
      if (savedFeeTotal > 0) {
        finalFeeTotal = savedFeeTotal
      }
    }

    const adservingTechFees =
      parseFloat((entry.adservingTechFees || entry.adServing || "0").toString().replace(/[^0-9.]/g, "")) || 0
    const production = parseFloat((entry.production || "0").toString().replace(/[^0-9.]/g, "")) || 0
    let totalAmountNum = totalMedia + finalFeeTotal + adservingTechFees + production

    // Legacy / MBA PDF shape: month row with totalAmount only (no mediaTypes)
    if (
      Object.keys(lineItems).length === 0 &&
      (!entry.mediaTypes || !Array.isArray(entry.mediaTypes) || entry.mediaTypes.length === 0)
    ) {
      const legacyTotal = parseMoneySaved(entry.totalAmount ?? entry.amount)
      const feeLegacy = parseMoneySaved(entry.feeTotal)
      const adservLegacy = parseMoneySaved(entry.adservingTechFees ?? entry.adServing)
      const prodLegacy = parseMoneySaved(entry.production)
      if (
        monthYear &&
        (legacyTotal > 0 || feeLegacy > 0 || adservLegacy > 0 || prodLegacy > 0)
      ) {
        const inferredMedia =
          legacyTotal > 0
            ? Math.max(0, legacyTotal - feeLegacy - adservLegacy - prodLegacy)
            : totalMedia
        const useMedia = inferredMedia > 0 ? inferredMedia : totalMedia
        const useFee = feeLegacy > 0 ? feeLegacy : finalFeeTotal
        const useAd = adservLegacy > 0 ? adservLegacy : adservingTechFees
        const useProd = prodLegacy > 0 ? prodLegacy : production
        const productionLineItemsSumLegacy = (lineItems.production ?? []).reduce(
          (sum: number, item: any) => sum + (item.totalAmount ?? 0),
          0
        )
        const hasProductionLineItemsLegacy = productionLineItemsSumLegacy > 0
        const reconciledProductionLegacy = hasProductionLineItemsLegacy
          ? productionLineItemsSumLegacy
          : useProd
        mediaCosts.production = currencyFormatter.format(reconciledProductionLegacy)
        const finalProductionFormattedLegacy = currencyFormatter.format(reconciledProductionLegacy)
        totalAmountNum =
          legacyTotal > 0
            ? legacyTotal
            : useMedia + useFee + useAd + reconciledProductionLegacy
        return {
          monthYear,
          mediaTotal: currencyFormatter.format(useMedia),
          feeTotal: currencyFormatter.format(useFee),
          totalAmount: currencyFormatter.format(totalAmountNum),
          adservingTechFees: currencyFormatter.format(useAd),
          production: finalProductionFormattedLegacy,
          mediaCosts,
          lineItems: undefined,
        }
      }
    }

    const productionLineItemsSum = (lineItems.production ?? []).reduce(
      (sum: number, item: any) => sum + (item.totalAmount ?? 0),
      0
    )
    const hasProductionLineItems = productionLineItemsSum > 0
    const reconciledProduction = hasProductionLineItems ? productionLineItemsSum : production
    mediaCosts.production = currencyFormatter.format(reconciledProduction)
    const finalProductionFormatted = currencyFormatter.format(reconciledProduction)
    totalAmountNum = totalMedia + finalFeeTotal + adservingTechFees + reconciledProduction

    return {
      monthYear,
      mediaTotal: currencyFormatter.format(totalMedia),
      feeTotal: currencyFormatter.format(finalFeeTotal),
      totalAmount: currencyFormatter.format(totalAmountNum),
      adservingTechFees: currencyFormatter.format(adservingTechFees),
      production: finalProductionFormatted,
      mediaCosts,
      lineItems: Object.keys(lineItems).length > 0 ? lineItems : undefined,
    }
  })

  // Consolidate monthlyAmounts across all months for each line item
  const allMonthKeys = parsedBillingMonthRows.map((m) => m.monthYear)
  parsedBillingMonthRows.forEach((month) => {
    if (!month.lineItems) return
    Object.entries(month.lineItems).forEach(([mediaKey, items]) => {
      (items as BillingLineItemType[]).forEach((item) => {
        // Ensure all month keys exist
        allMonthKeys.forEach((mk) => {
          if (!(mk in item.monthlyAmounts)) {
            item.monthlyAmounts[mk] = 0
          }
        })
        // Find this item's amount in other months and merge
        parsedBillingMonthRows.forEach((otherMonth) => {
          if (otherMonth.monthYear === month.monthYear) return
          const otherItems = (otherMonth.lineItems as Record<string, BillingLineItemType[]> | undefined)?.[
            mediaKey
          ]
          const match = otherItems?.find((oi) => oi.id === item.id)
          if (match && match.monthlyAmounts[otherMonth.monthYear]) {
            item.monthlyAmounts[otherMonth.monthYear] = match.monthlyAmounts[otherMonth.monthYear]
          }
        })
        item.totalAmount = Object.values(item.monthlyAmounts).reduce((sum, v) => sum + v, 0)
      })
    })
  })

  const total = parsedBillingMonthRows.reduce((sum, m) => {
    return sum + parseFloat(m.totalAmount.replace(/[^0-9.]/g, ""))
  }, 0)
  const billingTotalFormatted = currencyFormatter.format(total)

  const partialEntry = parsed.find((e: any) => e?.partialApproval ?? e?.partial_approval)
  const savedPartial = (partialEntry?.partialApproval ?? partialEntry?.partial_approval) as
    | PartialApprovalMetadata
    | undefined
  const partial =
    savedPartial?.isPartial === true
      ? { hydrate: hydratePartialMbaFromSavedMetadata(savedPartial), metadata: savedPartial }
      : null

  return { months: parsedBillingMonthRows, billingTotalFormatted, partial }
}

/** Grand total line for the billing table from month `totalAmount` strings (aligned with auto-calculate). */
export { parseSavedBillingSchedulePayload as legacyEditorParse }
