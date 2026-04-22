import type {
  BoxPlotEntry,
  ChannelDailyRow,
  FunnelStage,
  HeatmapMatrix,
  MetricEntry,
  SnapshotEntry,
  SourceMediumRow,
  TreemapEntry,
} from "./types"

/** Deterministic pseudo-random in [0, 1) from integer coordinates (stable across runs). */
function det01(seed: number, a: number, b = 0): number {
  const x = Math.sin(seed * 12.9898 + a * 127.1 + b * 311.7) * 43758.5453123
  return x - Math.floor(x)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function isoDayFromIndex(startYmd: string, dayIndex: number): string {
  const [y, m, d] = startYmd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dayIndex))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export const keyKpis: readonly MetricEntry[] = [
  { label: "Website Visitors", value: "37,596", deltaPct: 23.1 },
  { label: "Inco Distributor", value: "861", deltaPct: -23.0 },
  { label: "Skin Distributor", value: "374", deltaPct: -29.7 },
  { label: "Samples Ordered", value: "974", deltaPct: -5.7 },
]

export const snapshot: readonly SnapshotEntry[] = [
  { label: "Sessions", value: "40,097", hint: "matches funnel top" },
  { label: "Engagement rate", value: "4.2%", hint: "sessions with 2+ events" },
  { label: "Google Ads clicks", value: "12,408" },
  { label: "Meta Ads clicks", value: "9,764" },
  { label: "Brand impressions", value: "2.14M" },
  { label: "Brand clicks", value: "18,220" },
  { label: "Avg. organic position", value: "2.4", hint: "Google Search Console" },
  { label: "Where to Buy clicks", value: "3,420" },
]

const CHANNEL_DAILY_START = "2026-03-01"

export const channelDaily: readonly ChannelDailyRow[] = Array.from({ length: 28 }, (_, day) => {
  const dow = (new Date(`${CHANNEL_DAILY_START}T00:00:00Z`).getUTCDay() + day) % 7
  const weekend = dow === 0 || dow === 6
  const boost = weekend ? 0.9 : 1.04
  return {
    date: isoDayFromIndex(CHANNEL_DAILY_START, day),
    paidSocial: clamp((220 + det01(11, day, 1) * 520) * boost, 200, 800),
    paidSearch: clamp(240 + det01(11, day, 2) * 500, 200, 800),
    organic: clamp(260 + det01(11, day, 3) * 480, 200, 800),
    direct: clamp(200 + det01(11, day, 4) * 420, 200, 800),
    referral: clamp(180 + det01(11, day, 5) * 360, 200, 800),
  }
})

export const funnel: readonly FunnelStage[] = [
  { label: "Sessions", value: 40097 },
  { label: "Product Views", value: 16563 },
  { label: "Add to Cart", value: 1926 },
  { label: "Checkout", value: 1135 },
  { label: "Order", value: 974 },
]

export const treemap: readonly TreemapEntry[] = [
  { name: "/products/molicare-premium", size: 18420, intensity: 94 },
  { name: "/where-to-buy", size: 16210, intensity: 88 },
  { name: "/skin-health/inco", size: 14180, intensity: 91 },
  { name: "/samples", size: 12880, intensity: 97 },
  { name: "/blog/managing-incontinence", size: 11240, intensity: 72 },
  { name: "/distributors", size: 9860, intensity: 66 },
  { name: "/products/molicare-active", size: 9020, intensity: 86 },
  { name: "/clinical-evidence", size: 7640, intensity: 58 },
  { name: "/contact", size: 6520, intensity: 52 },
  { name: "/privacy", size: 5340, intensity: 48 },
  { name: "/faq/shipping", size: 4980, intensity: 61 },
  { name: "/campaign/spring-care", size: 4320, intensity: 79 },
]

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)

function buildMolicareHeatmap(): HeatmapMatrix {
  const data = WEEKDAYS.map((_, r) =>
    HOURS.map((_, h) => {
      const weekend = r >= 5
      let base = 18 + Math.floor(det01(77, r, h) * 22)
      if (!weekend && (h === 8 || h === 9)) base += 58
      if (!weekend && (h === 12 || h === 13)) base += 44
      if (h === 20) base += 52
      if (weekend && h >= 7 && h <= 11) base -= 18
      return Math.max(5, Math.round(base))
    }),
  )
  return { rowLabels: [...WEEKDAYS], colLabels: HOURS, data }
}

export const heatmap: HeatmapMatrix = buildMolicareHeatmap()

export const boxplot: readonly BoxPlotEntry[] = [
  {
    label: "Facebook Prospecting",
    min: 820,
    q1: 1180,
    median: 1460,
    q3: 1720,
    max: 2040,
    outliers: [2380, 2510],
  },
  {
    label: "Google Generic",
    min: 640,
    q1: 980,
    median: 1220,
    q3: 1510,
    max: 1880,
    outliers: [2140],
  },
  { label: "TikTok Awareness", min: 540, q1: 760, median: 910, q3: 1080, max: 1320 },
  { label: "Programmatic Display", min: 420, q1: 610, median: 740, q3: 900, max: 1120 },
  { label: "YouTube TrueView", min: 380, q1: 520, median: 640, q3: 780, max: 960 },
  { label: "Organic Search", min: 900, q1: 1180, median: 1340, q3: 1520, max: 1760 },
]

/**
 * Source / medium mix aligned with a typical Looker-style acquisition table
 * (sessions + conversions + derived conversion rate).
 */
export const sourceMedium: readonly SourceMediumRow[] = [
  { sourceMedium: "google / cpc", sessions: 12840, conversions: 942, conversionRatePct: (942 / 12840) * 100 },
  { sourceMedium: "facebook / cpc", sessions: 10120, conversions: 688, conversionRatePct: (688 / 10120) * 100 },
  { sourceMedium: "facebook / social", sessions: 6840, conversions: 312, conversionRatePct: (312 / 6840) * 100 },
  { sourceMedium: "taboola / referral", sessions: 4920, conversions: 186, conversionRatePct: (186 / 4920) * 100 },
  { sourceMedium: "google / organic", sessions: 8760, conversions: 264, conversionRatePct: (264 / 8760) * 100 },
  { sourceMedium: "(direct) / (none)", sessions: 6120, conversions: 118, conversionRatePct: (118 / 6120) * 100 },
  { sourceMedium: "bing / cpc", sessions: 2140, conversions: 96, conversionRatePct: (96 / 2140) * 100 },
].map((row) => ({
  ...row,
  conversionRatePct: Math.round(row.conversionRatePct * 10) / 10,
}))
