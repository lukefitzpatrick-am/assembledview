/**
 * Sample data mirroring the gallery — swap for real query results.
 * Shapes here ARE the contract each component expects.
 */
import { BRAND } from '@/lib/brand';
import { STATUS, CHANNEL_COLORS } from '@/lib/chart-theme';

export const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Line / area — one row per period, one key per series. */
export const spendTrend = months.map((m, i) => ({
  month: m,
  spend: [12,18,15,22,26,24,30,28,34,31,38,42][i] * 1000,
  impressions: [20,22,19,25,23,28,26,31,29,33,30,36][i] * 1000,
  clicks: [8,11,10,14,13,12,17,16,15,19,18,22][i] * 1000,
}));

/** Bar — categories with one or more measures. */
export const channelSpend = [
  { channel: 'Television', budget: 72000, actual: 68000 },
  { channel: 'BVOD', budget: 52000, actual: 58000 },
  { channel: 'Social', budget: 40000, actual: 44000 },
  { channel: 'Search', budget: 30000, actual: 28000 },
];

/** Donut / treemap / sunburst-inner — part-to-whole (value = %). */
export const mediaMix = [
  { label: 'Television', value: 38, color: CHANNEL_COLORS.television },
  { label: 'BVOD', value: 24, color: CHANNEL_COLORS.bvod },
  { label: 'Social', value: 18, color: CHANNEL_COLORS.social },
  { label: 'Programmatic', value: 12, color: CHANNEL_COLORS.programmatic },
  { label: 'Search', value: 8, color: CHANNEL_COLORS.search },
];

/** Waterfall — signed deltas with explicit total/end caps. */
export const budgetWaterfall = [
  { label: 'Budget', value: 120000, kind: 'total' as const },
  { label: 'TV', value: -46000 },
  { label: 'BVOD', value: -29000 },
  { label: 'Social', value: -22000 },
  { label: 'Search', value: -13000 },
  { label: 'Remaining', value: 0, kind: 'end' as const },
];

/** Bullet — actual vs target (0–100). */
export const pacingBullets = [
  { label: 'TV delivery', measure: 82, target: 90 },
  { label: 'Social CTR', measure: 71, target: 65 },
  { label: 'Search CPA', measure: 54, target: 60 },
];

/** Scatter / bubble — x, y, z(size). */
export const cpaVsRoas = [
  { x: 20, y: 30, z: 8 }, { x: 28, y: 42, z: 12 }, { x: 35, y: 38, z: 6 },
  { x: 42, y: 55, z: 16 }, { x: 48, y: 50, z: 9 }, { x: 55, y: 68, z: 20 },
  { x: 60, y: 62, z: 11 }, { x: 68, y: 75, z: 14 }, { x: 80, y: 84, z: 18 },
];

/** Radar — one row per axis, one key per series. */
export const channelProfile = [
  { metric: 'Reach', linear: 80, digital: 55 },
  { metric: 'Frequency', linear: 62, digital: 72 },
  { metric: 'CTR', linear: 55, digital: 68 },
  { metric: 'VTR', linear: 70, digital: 50 },
  { metric: 'Conv', linear: 48, digital: 62 },
  { metric: 'ROAS', linear: 66, digital: 58 },
];

/** Funnel — descending stages (value = %). */
export const conversionFunnel = [
  { label: 'Impressions', value: 100, color: BRAND.colour.sky },
  { label: 'Clicks', value: 46, color: BRAND.colour.forestLight },
  { label: 'Visits', value: 28, color: BRAND.colour.forest },
  { label: 'Leads', value: 14, color: BRAND.colour.lime },
  { label: 'Sales', value: 6, color: BRAND.colour.forestLight },
];

/** Sankey — node list + index-based links. */
export const budgetFlow = {
  nodes: [
    { name: 'TV' }, { name: 'Digital' }, { name: 'Search' },
    { name: 'Awareness' }, { name: 'Consideration' }, { name: 'Conversion' },
  ],
  links: [
    { source: 0, target: 3, value: 34 }, { source: 0, target: 4, value: 26 },
    { source: 1, target: 4, value: 22 }, { source: 1, target: 5, value: 24 },
    { source: 2, target: 3, value: 10 }, { source: 2, target: 5, value: 14 },
  ],
};

/** Sunburst — channel → format. */
export const spendHierarchy = [
  { name: 'TV', value: 38, color: BRAND.colour.forest, children: [{ name: 'Linear', value: 22 }, { name: 'Sport', value: 16 }] },
  { name: 'Digital', value: 46, color: BRAND.colour.sky, children: [{ name: 'BVOD', value: 24 }, { name: 'Social', value: 12 }, { name: 'Display', value: 10 }] },
  { name: 'Search', value: 16, color: BRAND.colour.forest, children: [{ name: 'Brand', value: 9 }, { name: 'PMax', value: 7 }] },
];

/** Marimekko — weighted columns, each stacked. */
export const mekkoMix = [
  { name: 'TV', weight: 34, segments: [{ value: 55, color: BRAND.colour.forest }, { value: 45, color: BRAND.colour.context }] },
  { name: 'Digital', weight: 28, segments: [{ value: 40, color: BRAND.colour.sky }, { value: 35, color: BRAND.colour.sky }, { value: 25, color: BRAND.colour.forestLight }] },
  { name: 'Social', weight: 22, segments: [{ value: 60, color: BRAND.colour.ink }, { value: 40, color: BRAND.colour.muted }] },
  { name: 'Search', weight: 16, segments: [{ value: 70, color: BRAND.colour.forest }, { value: 30, color: BRAND.colour.forestLight }] },
];

/** Slope — rank change between two periods. */
export const rankShift = [
  { label: 'TV', left: 62, right: 48, color: BRAND.colour.forest },
  { label: 'Social', left: 30, right: 52, color: BRAND.colour.forest },
  { label: 'Search', left: 44, right: 40, color: BRAND.colour.forestLight },
  { label: 'BVOD', left: 24, right: 36, color: BRAND.colour.ink },
];

/** Histogram — pre-binned counts. */
export const cpmDistribution = [3,7,13,22,30,34,28,18,9,4].map((count, i) => ({ bin: `${i * 2}`, count }));

// ── DOMAIN / FLIGHTING ──────────────────────────────────────

/** Media flighting Gantt — line items × weeks, bursts coloured by channel. */
export const flightPlan = [
  { label: 'Nine Network', sub: 'television', bursts: [{ startWeek: 0, endWeek: 4, label: '$46k', intensity: 1 }, { startWeek: 12, endWeek: 16, label: '$32k', intensity: 0.85 }] },
  { label: 'Nine Now', sub: 'bvod', bursts: [{ startWeek: 1, endWeek: 6, label: '$29k', intensity: 0.9 }] },
  { label: 'YouTube', sub: 'display', bursts: [{ startWeek: 2, endWeek: 8, label: '$18k', intensity: 0.75 }, { startWeek: 14, endWeek: 20, label: '$14k', intensity: 0.7 }] },
  { label: 'Meta', sub: 'social', bursts: [{ startWeek: 0, endWeek: 24, label: '$22k', intensity: 0.55 }] },
  { label: 'TikTok', sub: 'social', bursts: [{ startWeek: 8, endWeek: 14, label: '$11k', intensity: 0.7 }] },
  { label: 'oOh!media', sub: 'ooh', bursts: [{ startWeek: 4, endWeek: 10, label: '$9k', intensity: 0.8 }] },
  { label: 'Google', sub: 'search', bursts: [{ startWeek: 0, endWeek: 24, label: '$13k', intensity: 0.5 }] },
];

/** Burst week-grid — merged cells per line item. */
export const burstRows = [
  { label: 'Television', cells: [{ startWeek: 0, endWeek: 3, label: '320 TARP', color: BRAND.colour.forest }] },
  { label: 'BVOD', cells: [{ startWeek: 1, endWeek: 5, label: '1.2M imp', color: BRAND.colour.ink }] },
  { label: 'Social', cells: [{ startWeek: 0, endWeek: 11, label: 'always-on', color: BRAND.colour.sky }] },
  { label: 'Search', cells: [{ startWeek: 2, endWeek: 8, label: '$8k', color: BRAND.colour.forest }] },
  { label: 'OOH', cells: [{ startWeek: 4, endWeek: 7, label: '45 panels', color: BRAND.colour.lime }] },
];

/** Matrix heatmap — daypart × day, values 0..1. */
export const daypartMatrix = {
  rows: ['Breakfast', 'Daytime', 'Peak', 'Late', 'Overnight'],
  cols: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  values: [
    [0.5, 0.55, 0.6, 0.62, 0.7, 0.4, 0.35],
    [0.35, 0.4, 0.42, 0.45, 0.5, 0.55, 0.5],
    [0.8, 0.82, 0.85, 0.88, 0.95, 0.9, 0.85],
    [0.6, 0.62, 0.65, 0.6, 0.75, 0.85, 0.8],
    [0.15, 0.18, 0.2, 0.22, 0.3, 0.45, 0.4],
  ],
};

/** Pacing — cumulative % delivered per week (target auto-linear). */
export const pacingActual = [0, 7, 15, 21, 30, 39, 46, 52, 61, 70, 80, 88, 96];
export const pacingWeeks = ['W1', '', 'W3', '', 'W5', '', 'W7', '', 'W9', '', 'W11', '', 'W13'];

/** Boxplot — CPM spread per channel. */
export const cpmByChannel = [
  { label: 'TV', min: 8, q1: 14, med: 19, q3: 26, max: 34, outliers: [42], color: BRAND.colour.forest },
  { label: 'BVOD', min: 12, q1: 18, med: 24, q3: 30, max: 38, color: BRAND.colour.ink },
  { label: 'Social', min: 5, q1: 9, med: 13, q3: 18, max: 24, outliers: [30], color: BRAND.colour.sky },
  { label: 'Search', min: 6, q1: 10, med: 13, q3: 17, max: 22, color: BRAND.colour.forest },
  { label: 'Display', min: 4, q1: 7, med: 10, q3: 14, max: 20, color: BRAND.colour.sky },
];
