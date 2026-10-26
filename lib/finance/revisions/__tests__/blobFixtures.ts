/**
 * Billing blobs (legacy_schedules.billingSchedule) rebuilt from Supabase
 * SELECTs on 26 Oct 2026. Every month row in these blobs carries the same
 * lineItems object (checked: one distinct lineItems per version), so the
 * fixture stores it once and clones it per month.
 * buxton004 v10 (12903) and penfold022 v3 (17414).
 */

type Item = Record<string, unknown>

const MEDIA_COST_KEYS = [
  "ooh", "bvod", "radio", "cinema", "search", "progOoh", "progBvod", "digiAudio", "digiVideo",
  "magazines", "newspaper", "progAudio", "progVideo", "production", "television", "digiDisplay",
  "influencers", "integration", "progDisplay", "socialMedia",
] as const

function zeros(labels: string[]): Record<string, number> {
  return Object.fromEntries(labels.map((l) => [l, 0]))
}

function item(args: {
  id: string
  mediaType: string
  buyType: string
  monthly: Record<string, number>
  fee?: Record<string, number>
  labels: string[]
  adServing?: boolean
}): Item {
  const monthly = { ...zeros(args.labels), ...args.monthly }
  const fee = { ...zeros(args.labels), ...(args.fee ?? {}) }
  const total = Math.round(Object.values(monthly).reduce((s, v) => s + v, 0) * 100) / 100
  const feeTotal = Math.round(Object.values(fee).reduce((s, v) => s + v, 0) * 100) / 100
  return {
    id: args.id,
    buyType: args.buyType,
    header1: args.mediaType,
    header2: args.id,
    feeAmount: feeTotal,
    mediaType: args.mediaType,
    billingMode: "auto",
    mediaAmount: total,
    totalAmount: total,
    feeBillingMode: "auto",
    monthlyAmounts: monthly,
    totalFeeAmount: feeTotal,
    feeMonthlyAmounts: fee,
    ...(args.adServing ? { totalAdServingAmount: 0, adServingMonthlyAmounts: zeros(args.labels) } : {}),
  }
}

function month(
  monthYear: string,
  h: { mediaTotal: string; feeTotal: string; totalAmount: string; production: string; costs: Record<string, string> },
  lineItems: Record<string, Item[]>,
) {
  const mediaCosts: Record<string, string> = Object.fromEntries(MEDIA_COST_KEYS.map((k) => [k, "$0.00"]))
  Object.assign(mediaCosts, h.costs)
  return {
    feeTotal: h.feeTotal,
    lineItems: JSON.parse(JSON.stringify(lineItems)) as Record<string, Item[]>,
    monthYear,
    mediaCosts,
    mediaTotal: h.mediaTotal,
    production: h.production,
    totalAmount: h.totalAmount,
    adservingTechFees: "$0.00",
  }
}

const BUX_LABELS = [
  "March 2026", "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
  "September 2026", "October 2026", "November 2026", "December 2026",
]

export function buxton004V10Blob() {
  const L = BUX_LABELS
  const m = (v: number[]) => Object.fromEntries(L.map((l, i) => [l, v[i] ?? 0]))
  const lineItems = {
    digiDisplay: [
      item({ id: "buxton004DD1", mediaType: "digiDisplay", buyType: "fixed_cost", labels: L, adServing: true,
        monthly: m([2695.65, 5054.35, 5222.82, 5054.35, 5222.83, 5222.83, 5054.35, 5222.82, 5054.35, 2695.65]) }),
      item({ id: "buxton004DD5", mediaType: "digiDisplay", buyType: "cpm", labels: L, adServing: true,
        monthly: m([1500, 2900, 1600, 0, 1500, 2951.61, 1548.39, 0, 0, 0]) }),
      item({ id: "buxton004DD6", mediaType: "digiDisplay", buyType: "fixed_cost", labels: L, adServing: true,
        monthly: m([12000]) }),
      item({ id: "buxton004DD7", mediaType: "digiDisplay", buyType: "fixed_cost", labels: L, adServing: true,
        monthly: m([3310.29, 6289.28, 6496.17, 3732.19, 3268.37, 5114.18, 5031.69, 5196.67, 5031.69, 2557.09]) }),
    ],
    socialMedia: [
      item({ id: "buxton004SM1", mediaType: "socialMedia", buyType: "fixed_cost", labels: L,
        monthly: m([2500, 5000, 5000, 5000, 5000, 2500]),
        fee: m([625, 1250, 1250, 1250, 1250, 625]) }),
    ],
  }
  const H: Array<[string, string, string, string, string]> = [
    ["$22,005.94", "$625.00", "$22,630.94", "$19,505.94", "$2,500.00"],
    ["$19,243.63", "$1,250.00", "$20,493.63", "$14,243.63", "$5,000.00"],
    ["$18,318.99", "$1,250.00", "$19,568.99", "$13,318.99", "$5,000.00"],
    ["$13,786.54", "$1,250.00", "$15,036.54", "$8,786.54", "$5,000.00"],
    ["$14,991.20", "$1,250.00", "$16,241.20", "$9,991.20", "$5,000.00"],
    ["$15,788.62", "$625.00", "$16,413.62", "$13,288.62", "$2,500.00"],
    ["$11,634.43", "$0.00", "$11,634.43", "$11,634.43", "$0.00"],
    ["$10,419.49", "$0.00", "$10,419.49", "$10,419.49", "$0.00"],
    ["$10,086.04", "$0.00", "$10,086.04", "$10,086.04", "$0.00"],
    ["$5,252.74", "$0.00", "$5,252.74", "$5,252.74", "$0.00"],
  ]
  return L.map((label, i) => {
    const [mediaTotal, feeTotal, totalAmount, dd, sm] = H[i]!
    return month(label, { mediaTotal, feeTotal, totalAmount, production: "$0.00", costs: { digiDisplay: dd, socialMedia: sm } }, lineItems)
  })
}

export function penfold022V3Blob() {
  const L = ["November 2026", "December 2026"]
  const m = (nov: number, dec: number) => ({ "November 2026": nov, "December 2026": dec })
  const lineItems = {
    production: [item({ id: "penfold022PROD1", mediaType: "production", buyType: "cpc", labels: L, monthly: m(3620.69, 3379.31) })],
    digiDisplay: [
      item({ id: "penfold022DD1", mediaType: "digiDisplay", buyType: "cpv", labels: L, adServing: true, monthly: m(3000, 0) }),
      item({ id: "penfold022DD8", mediaType: "digiDisplay", buyType: "cpm", labels: L, adServing: true, monthly: m(9999.99, 0) }),
    ],
    socialMedia: [
      item({ id: "penfold022SM1", mediaType: "socialMedia", buyType: "fixed_cost", labels: L, monthly: m(4017.86, 3482.14) }),
      item({ id: "penfold022SM2", mediaType: "socialMedia", buyType: "fixed_cost", labels: L, monthly: m(803.57, 696.43) }),
      item({ id: "penfold022SM3", mediaType: "socialMedia", buyType: "fixed_cost", labels: L, monthly: m(2678.57, 2321.43) }),
      item({ id: "penfold022SM4", mediaType: "socialMedia", buyType: "fixed_cost", labels: L, monthly: m(535.71, 464.29) }),
    ],
  }
  return [
    month("November 2026", { mediaTotal: "$21,035.70", feeTotal: "$0.00", totalAmount: "$24,656.39", production: "$3,620.69",
      costs: { production: "$3,620.69", digiDisplay: "$12,999.99", socialMedia: "$8,035.71" } }, lineItems),
    month("December 2026", { mediaTotal: "$6,964.29", feeTotal: "$0.00", totalAmount: "$10,343.60", production: "$3,379.31",
      costs: { production: "$3,379.31", socialMedia: "$6,964.29" } }, lineItems),
  ]
}
