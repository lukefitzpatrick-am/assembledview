/**
 * AssembledView — chart theme
 * Single source of truth for every chart's colour, scale and number format.
 * No chart should hard-code a hex value; import from here.
 */

// ─────────────────────────────────────────────────────────────
// Categorical palette — assign series in order.
// Maps 1:1 to the shadcn CSS vars --chart-1 … --chart-8 (see chart-tokens.css).
// ─────────────────────────────────────────────────────────────
export const CHART_PALETTE = [
  '#008E5E', // 1 · Assembled green
  '#4F8FCB', // 2 · blue
  '#E8A317', // 3 · amber
  '#472477', // 4 · purple
  '#15C7C9', // 5 · teal
  '#E5573E', // 6 · coral
  '#B5D337', // 7 · lime
  '#49C7EB', // 8 · sky
] as const;

/** Colour-blind-safe alternate (Okabe–Ito derived). Swap in via ChartProvider. */
export const CHART_PALETTE_CB = [
  '#0072B2', '#E69F00', '#009E73', '#D55E00',
  '#CC79A7', '#56B4E9', '#8C6BB1', '#117733',
] as const;

/** Sequential ramp (low → high) — heatmaps, choropleths, magnitude. */
export const SEQUENTIAL = [
  '#eaf3ee', '#c5e3d4', '#8ecdae', '#4fb185', '#0f8a5a', '#0c6b46', '#0F3D26',
] as const;

/** Diverging ramp (coral ◄ neutral ► green) — variance vs target. */
export const DIVERGING = [
  '#E5573E', '#ef8a73', '#f4c9bb', '#ece9e2', '#bfe2d0', '#7cc6a2', '#008E5E',
] as const;

/** Status encoding — pacing / health. */
export const STATUS = {
  ahead: '#008E5E',
  onTrack: '#4F8FCB',
  behind: '#E8A317',
  critical: '#E5573E',
} as const;

/**
 * Fixed media-channel hues. When a series is bound to a channel it keeps its
 * colour everywhere (don't let palette order reassign it).
 */
export const CHANNEL_COLORS: Record<string, string> = {
  television: '#E5573E',
  bvod: '#472477',
  social: '#49C7EB',
  programmatic: '#4F8FCB',
  search: '#008E5E',
  display: '#15C7C9',
  audio: '#E8A317',
  ooh: '#B5D337',
};

/** Neutrals — theme-aware via chart-tokens.css (--av-* flip under .dark). */
export const NEUTRAL = {
  grid: 'var(--av-grid)',
  axis: 'var(--av-axis)',
  label: 'var(--av-label)',
  ink: 'var(--av-ink)',
  surface: 'var(--av-surface)',
  subSurface: 'var(--av-subsurface)',
  cursor: 'var(--av-cursor)',
} as const;

// ─────────────────────────────────────────────────────────────
// Scale helpers
// ─────────────────────────────────────────────────────────────
function lerpRamp(ramp: readonly string[], t: number): string {
  const x = Math.min(1, Math.max(0, t));
  const i = Math.min(ramp.length - 1, Math.round(x * (ramp.length - 1)));
  return ramp[i];
}
/** Sequential colour for a normalised value 0..1. */
export const seqColor = (t: number) => lerpRamp(SEQUENTIAL, t);
/** Diverging colour for a normalised value 0..1 (0 = coral, .5 = neutral, 1 = green). */
export const divColor = (t: number) => lerpRamp(DIVERGING, t);

/** Pick a categorical colour by index, wrapping. */
export const seriesColor = (i: number, cb = false) =>
  (cb ? CHART_PALETTE_CB : CHART_PALETTE)[i % CHART_PALETTE.length];

// ─────────────────────────────────────────────────────────────
// Number / label formatting — always tabular, always compact on axes.
// ─────────────────────────────────────────────────────────────
const compactNF = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 });
const intNF = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const money0NF = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

export const fmt = {
  /** 48210 → "48.2K", 2_410_000 → "2.4M" */
  compact: (n: number) => compactNF.format(n),
  /** 48210 → "$48.2K" */
  currencyCompact: (n: number) => '$' + compactNF.format(n),
  /** 48210 → "$48,210" */
  currency: (n: number) => money0NF.format(n),
  /** 0.732 → "73%"  (pass ratio 0..1) */
  percent: (ratio: number, dp = 0) => (ratio * 100).toFixed(dp) + '%',
  /** 1240 → "1,240" */
  number: (n: number) => intNF.format(n),
};

/** Tabular-figure style — spread onto any <text>/<span> showing a value. */
export const TABULAR: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
};

export const CHART_FONT =
  "'Rethink Sans', ui-sans-serif, system-ui, sans-serif";

// ─────────────────────────────────────────────────────────────
// shadcn ChartConfig helper — build a config object from a series map
// so <ChartContainer> injects the right --color-<key> vars + legend labels.
// ─────────────────────────────────────────────────────────────
import type { ChartConfig } from '@/components/ui/chart';

export function buildConfig(
  series: { key: string; label: string; color?: string }[],
  cb = false,
): ChartConfig {
  return series.reduce((acc, s, i) => {
    acc[s.key] = { label: s.label, color: s.color ?? seriesColor(i, cb) };
    return acc;
  }, {} as ChartConfig);
}
