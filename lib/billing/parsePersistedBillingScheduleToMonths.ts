import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

/** Unwrap string / `{ months: [...] }` / top-level array from media_plan_versions or API. */
export function normalizeBillingScheduleToArray(raw: unknown): unknown[] | null {
  if (raw == null || raw === "") return null
  let v: unknown = raw
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return null
    try {
      v = JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  if (Array.isArray(v)) return v.length > 0 ? v : null
  if (v && typeof v === "object" && Array.isArray((v as { months?: unknown }).months)) {
    const m = (v as { months: unknown[] }).months
    return m.length > 0 ? m : null
  }
  return null
}

const parseMoneySaved = (val: unknown) => parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * Parse persisted `billingSchedule` JSON (compact Xano / MBA shape) into `BillingMonth[]`
 * for finance hub Alter Billing. Mirrors the edit page hydrate path with fees defaulting to 0.
 */
export function parsePersistedBillingScheduleToMonths(
  billingSchedule: unknown,
  fees: { searchFee: number; socialFee: number } = { searchFee: 0, socialFee: 0 }
): BillingMonth[] | null {
  const parsed = normalizeBillingScheduleToArray(billingSchedule)
  if (!parsed) return null

  const sample = parsed[0] as Record<string, unknown> | undefined
  const mediaTypesRaw = sample?.mediaTypes ?? (sample as { media_types?: unknown }).media_types
  if (
    sample &&
    typeof sample === "object" &&
    typeof sample.monthYear === "string" &&
    sample.lineItems &&
    typeof sample.lineItems === "object" &&
    !Array.isArray(sample.lineItems) &&
    !Array.isArray(mediaTypesRaw)
  ) {
    return JSON.parse(JSON.stringify(parsed)) as BillingMonth[]
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

  const parsedBillingMonthRows: BillingMonth[] = (parsed as Record<string, unknown>[]).map((entry) => {
    const monthYear =
      String(entry.monthYear ?? entry.month_year ?? entry.month ?? entry.month_label ?? "") || ""
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
    const lineItems: Record<string, BillingLineItem[]> = {}

    const entryMediaTypes = entry.mediaTypes ?? entry.media_types
    if (entryMediaTypes && Array.isArray(entryMediaTypes)) {
      entryMediaTypes.forEach((mediaType: Record<string, unknown>) => {
        const label =
          (mediaType.mediaType as string) ||
          (mediaType.media_type as string) ||
          (mediaType.type as string) ||
          (mediaType.name as string) ||
          ""
        const mediaKey = mediaTypeLabelMap[label] || String(label).toLowerCase()

        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          const mediaTotal = (mediaType.lineItems as Record<string, unknown>[]).reduce((sum: number, item) => {
            const amountStr = item.amount ?? item.__amountValue ?? "0"
            const amount =
              typeof amountStr === "string"
                ? parseFloat(amountStr.replace(/[^0-9.]/g, ""))
                : Number(amountStr) || 0
            return sum + (amount || 0)
          }, 0)

          ;(mediaCosts as Record<string, string>)[mediaKey] = currencyFormatter.format(mediaTotal)
          totalMedia += mediaTotal

          let feePercentage = 0
          if (mediaKey === "search") feePercentage = searchFee
          else if (mediaKey === "socialMedia") feePercentage = socialFee
          const feeAmount = (mediaTotal * feePercentage) / 100
          totalFee += feeAmount

          lineItems[mediaKey] = (mediaType.lineItems as Record<string, unknown>[]).map((item) => {
            const amount =
              parseFloat((item.amount ?? item.__amountValue ?? "0").toString().replace(/[^0-9.]/g, "")) || 0
            const monthlyAmounts: Record<string, number> = {}
            ;(parsed as Record<string, unknown>[]).forEach((e) => {
              const m = String(e.monthYear ?? e.month ?? "").trim()
              monthlyAmounts[m] = m === monthYear ? amount : 0
            })

            const rawLiId = item.lineItemId ?? item.line_item_id
            const mediaAmount = optionalFiniteNumber(item.mediaAmount)
            const feeAmount = optionalFiniteNumber(item.feeAmount)
            const mediaTypeValue = optionalString(item.mediaType)
            const publisher = optionalString(item.publisher)
            const buyType = optionalString(item.buyType)
            const format = optionalString(item.format)
            const station = optionalString(item.station)
            const feeMonthlyAmounts =
              feeAmount !== undefined
                ? Object.fromEntries(
                    (parsed as Record<string, unknown>[]).map((e) => {
                      const m = String(e.monthYear ?? e.month ?? "").trim()
                      return [m, m === monthYear ? feeAmount : 0]
                    })
                  )
                : undefined
            const billingMode =
              item.billingMode === "auto" || item.billingMode === "manual"
                ? item.billingMode
                : undefined
            return {
              id:
                rawLiId != null && String(rawLiId).trim() !== ""
                  ? String(rawLiId)
                  : `${mediaKey}-${item.header1}-${item.header2}`,
              header1: String(item.header1 ?? ""),
              header2: String(item.header2 ?? ""),
              monthlyAmounts,
              totalAmount: amount,
              ...(mediaTypeValue ? { mediaType: mediaTypeValue } : {}),
              ...(publisher ? { publisher } : {}),
              ...(buyType ? { buyType } : {}),
              ...(format ? { format } : {}),
              ...(station ? { station } : {}),
              ...(mediaAmount !== undefined ? { mediaAmount } : {}),
              ...(feeAmount !== undefined ? { feeAmount, feeMonthlyAmounts, totalFeeAmount: feeAmount } : {}),
              ...(item.clientPaysForMedia === true ? { clientPaysForMedia: true } : {}),
              ...(billingMode ? { billingMode } : {}),
            }
          })
        }
      })
    }

    let finalFeeTotal = totalFee
    if (entry.feeTotal) {
      const savedFeeTotal = parseFloat(String(entry.feeTotal).replace(/[^0-9.]/g, "")) || 0
      if (savedFeeTotal > 0) {
        finalFeeTotal = savedFeeTotal
      }
    }

    const adservingTechFees =
      parseFloat((String(entry.adservingTechFees ?? entry.adServing ?? "0") || "0").replace(/[^0-9.]/g, "")) || 0
    const production = parseFloat((String(entry.production ?? "0") || "0").replace(/[^0-9.]/g, "")) || 0
    let totalAmountNum = totalMedia + finalFeeTotal + adservingTechFees + production

    if (
      Object.keys(lineItems).length === 0 &&
      (!entry.mediaTypes || !Array.isArray(entry.mediaTypes) || entry.mediaTypes.length === 0) &&
      (!(entry as { media_types?: unknown }).media_types ||
        !Array.isArray((entry as { media_types: unknown[] }).media_types) ||
        (entry as { media_types: unknown[] }).media_types.length === 0)
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
          (sum: number, item) => sum + (item.totalAmount ?? 0),
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
      (sum: number, item) => sum + (item.totalAmount ?? 0),
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

  const allMonthKeys = parsedBillingMonthRows.map((m) => m.monthYear)

  parsedBillingMonthRows.forEach((month) => {
    if (!month.lineItems) return
    Object.entries(month.lineItems).forEach(([mediaKey, items]) => {
      items.forEach((item) => {
        allMonthKeys.forEach((mk) => {
          if (!(mk in item.monthlyAmounts)) {
            item.monthlyAmounts[mk] = 0
          }
        })
        parsedBillingMonthRows.forEach((otherMonth) => {
          if (otherMonth.monthYear === month.monthYear) return
          const otherItems = otherMonth.lineItems?.[mediaKey as keyof NonNullable<typeof otherMonth.lineItems>] as
            | BillingLineItem[]
            | undefined
          const match = otherItems?.find((oi) => oi.id === item.id)
          if (match && match.monthlyAmounts[otherMonth.monthYear]) {
            item.monthlyAmounts[otherMonth.monthYear] = match.monthlyAmounts[otherMonth.monthYear]
          }
        })
        item.totalAmount = Object.values(item.monthlyAmounts).reduce((sum, v) => sum + v, 0)
      })
    })
  })

  return parsedBillingMonthRows
}
