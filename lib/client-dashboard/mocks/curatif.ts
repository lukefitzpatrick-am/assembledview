import type {
  BoxPlotEntry,
  BudgetMixEntry,
  ChannelRevenueRow,
  FunnelStage,
  MetricEntry,
  NightingaleEntry,
  RevenueDailyRow,
  SnapshotEntry,
  TopProductRow,
  TreemapEntry,
  WaterfallEntry,
} from "./types"

export const keyKpis: readonly MetricEntry[] = [
  { label: "Total Revenue", value: "$50,840", deltaPct: -1.9 },
  { label: "Transactions", value: "242", deltaPct: -18.2 },
  { label: "Basket Size", value: "$210.08", deltaPct: 19.9 },
  { label: "Conversion Rate", value: "1.66%", deltaPct: -5.6 },
]

export const snapshot: readonly SnapshotEntry[] = [
  { label: "Total users", value: "48,920" },
  { label: "New users", value: "12,640", hint: "first-time visitors" },
  { label: "Sessions", value: "16,722", hint: "matches funnel top" },
  { label: "Engagement rate", value: "5.8%", hint: "sessions with 2+ events" },
  { label: "Media spend", value: "$18,420" },
  { label: "ROAS", value: "3.1x", hint: "blended, last-click" },
  { label: "Cart adds", value: "1,832", hint: "matches funnel" },
  { label: "Checkouts", value: "487", hint: "matches funnel" },
]

const REVENUE_DAILY_START = "2026-03-01"

/** 28 integers summing to 242 (deterministic: 8 per day + 18 extra spread across first days). */
const dailyTransactions: readonly number[] = Array.from({ length: 28 }, (_, i) => 8 + (i < 18 ? 1 : 0))

function isoDayFromIndex(startYmd: string, dayIndex: number): string {
  const [y, m, d] = startYmd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dayIndex))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function buildRevenueDaily(): RevenueDailyRow[] {
  const totalRevenue = 50840
  const totalTx = dailyTransactions.reduce((a, b) => a + b, 0)
  const exact = dailyTransactions.map((t) => (totalRevenue * t) / totalTx)
  const floors = exact.map((v) => Math.floor(v))
  let remainder = totalRevenue - floors.reduce((s, v) => s + v, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  const addOne = new Set<number>()
  let p = 0
  while (remainder > 0 && p < order.length) {
    addOne.add(order[p].i)
    remainder -= 1
    p += 1
  }
  return dailyTransactions.map((t, i) => ({
    date: isoDayFromIndex(REVENUE_DAILY_START, i),
    transactions: t,
    revenue: floors[i] + (addOne.has(i) ? 1 : 0),
  }))
}

export const revenueDaily: readonly RevenueDailyRow[] = buildRevenueDaily()

export const funnel: readonly FunnelStage[] = [
  { label: "Sessions", value: 16722 },
  { label: "Product Views", value: 8421 },
  { label: "Add to Cart", value: 1832 },
  { label: "Checkout", value: 487 },
  { label: "Purchase", value: 242 },
]

export const waterfall: readonly WaterfallEntry[] = [
  { label: "Prior Period", value: 51820, type: "start" },
  { label: "Paid Social", value: 3400, type: "positive" },
  { label: "Paid Search", value: 2100, type: "positive" },
  { label: "Email", value: 1800, type: "positive" },
  { label: "Organic", value: -4200, type: "negative" },
  { label: "Direct", value: -2900, type: "negative" },
  { label: "Refunds", value: -1180, type: "negative" },
  { label: "Current Period", value: 50840, type: "total" },
]

export const nightingale: readonly NightingaleEntry[] = [
  { label: "Paid Social", value: 19800 },
  { label: "Paid Search", value: 13420 },
  { label: "Display", value: 6120 },
  { label: "Email", value: 4560 },
  { label: "Affiliate", value: 2890 },
  { label: "Other", value: 4050 },
]

export const budgetMix: readonly BudgetMixEntry[] = [
  { label: "Paid Social", pct: 42 },
  { label: "Paid Search", pct: 28 },
  { label: "Display", pct: 12 },
  { label: "Email", pct: 8 },
  { label: "Influencer", pct: 6 },
  { label: "Other", pct: 4 },
]

export const channelRevenue: readonly ChannelRevenueRow[] = [
  { channel: "Paid Social", newCustomerRevenue: 11240, returningCustomerRevenue: 8560 },
  { channel: "Paid Search", newCustomerRevenue: 7420, returningCustomerRevenue: 6000 },
  { channel: "Display", newCustomerRevenue: 3180, returningCustomerRevenue: 2940 },
  { channel: "Email", newCustomerRevenue: 1980, returningCustomerRevenue: 2580 },
  { channel: "Affiliate", newCustomerRevenue: 1540, returningCustomerRevenue: 1350 },
  { channel: "Other", newCustomerRevenue: 2100, returningCustomerRevenue: 1950 },
]

export const topProducts: readonly TopProductRow[] = [
  { name: "Classic Negroni 700ml", units: 86, revenue: 9810, deltaPct: 12.4 },
  { name: "Espresso Martini RTD 4pk", units: 64, revenue: 7420, deltaPct: -4.1 },
  { name: "Barrel-Aged Gin 500ml", units: 42, revenue: 6880, deltaPct: 8.8 },
  { name: "Amaro Flight 3x200ml", units: 38, revenue: 5120, deltaPct: -1.6 },
  { name: "Gift Pack — Summer", units: 31, revenue: 4680, deltaPct: 22.0 },
]

export const treemap: readonly TreemapEntry[] = [
  { name: "/collections/ready-to-drink", size: 14220, intensity: 92 },
  { name: "/products/negroni-kit", size: 12880, intensity: 88 },
  { name: "/collections/gin", size: 11140, intensity: 85 },
  { name: "/pages/stockists", size: 9860, intensity: 79 },
  { name: "/blogs/cocktail-recipes", size: 8420, intensity: 71 },
  { name: "/cart", size: 7640, intensity: 96 },
  { name: "/products/espresso-martini", size: 6980, intensity: 90 },
  { name: "/search", size: 6120, intensity: 58 },
  { name: "/pages/shipping", size: 5340, intensity: 52 },
  { name: "/account", size: 4680, intensity: 61 },
]

export const boxplot: readonly BoxPlotEntry[] = [
  { label: "Paid Social — Prospecting", min: 118, q1: 162, median: 186, q3: 214, max: 248, outliers: [272] },
  { label: "Paid Search — Brand", min: 96, q1: 132, median: 154, q3: 180, max: 206 },
  { label: "Meta Advantage+", min: 88, q1: 120, median: 142, q3: 168, max: 198 },
  { label: "Shopping — PMax", min: 102, q1: 138, median: 158, q3: 184, max: 218 },
  { label: "Display — CTV", min: 72, q1: 98, median: 116, q3: 136, max: 162 },
  { label: "Email — Lifecycle", min: 54, q1: 76, median: 92, q3: 110, max: 132 },
]
