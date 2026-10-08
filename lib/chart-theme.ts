/**
 * AssembledView — chart theme
 * Series colours come from `lib/brand` (brand series, channel families, status).
 * No chart should hard-code a hex value; import from here.
 *
 * Known media types resolve through `MEDIA_TYPE_REGISTRY` (family colour).
 * `CHANNEL_COLORS` remains for coarse aggregate series
 * (e.g. chart-gallery "programmatic" / "social").
 */

import { BRAND } from '@/lib/brand';
import { BRAND_SERIES, MEDIA_FAMILY, MEDIA_TYPE_FAMILY, type MediaFamily, type MediaTypeThemeKey } from '@/lib/design/mediaFamilies';
import { useTheme } from 'next-themes';
import { formatMoney, formatMoneyCompact } from '@/lib/format/money';
import {
  getMediaColor,
  MEDIA_TYPE_REGISTRY,
  normalizeEntityKey,
  type MediaTypeRegistryKey,
} from '@/lib/charts/registry';

// ─────────────────────────────────────────────────────────────
// Categorical palette — brand series, assigned in order.
// ─────────────────────────────────────────────────────────────
export const CHART_PALETTE = BRAND_SERIES;

/** Colour-blind-safe alternate (Okabe–Ito derived). Swap in via ChartProvider. */
export const CHART_PALETTE_CB = [
  '#0072B2', '#E69F00', '#009E73', '#D55E00',
  '#CC79A7', '#56B4E9', '#8C6BB1', '#117733',
] as const;

/**
 * Derived ramp, sand to forest. Sand, forest light, forest and ink come from BRAND.
 * The three stops between sand and forest light are mixed.
 */
export const SEQUENTIAL_MIXED_STOPS = ['#D6E2D2', '#A9C7B3', '#7BAA90'] as const;

/** Sequential ramp (low → high) — heatmaps, choropleths, magnitude. */
export const SEQUENTIAL = [
  BRAND.colour.sand,
  SEQUENTIAL_MIXED_STOPS[0],
  SEQUENTIAL_MIXED_STOPS[1],
  SEQUENTIAL_MIXED_STOPS[2],
  BRAND.colour.forestLight,
  BRAND.colour.forest,
  BRAND.colour.ink,
] as const;

/**
 * Derived ramp, coral to sand to forest. The ends and the middle come from BRAND.
 * The stops between them are mixed.
 */
export const DIVERGING_MIXED_STOPS = ['#E28F7B', '#EFC6B9', '#B9D3C3', '#6FA287'] as const;

/** Diverging ramp (coral ◄ neutral ► forest) — variance vs target. */
export const DIVERGING = [
  BRAND.functional.coral,
  DIVERGING_MIXED_STOPS[0],
  DIVERGING_MIXED_STOPS[1],
  BRAND.colour.sand,
  DIVERGING_MIXED_STOPS[2],
  DIVERGING_MIXED_STOPS[3],
  BRAND.colour.forest,
] as const;

/** Status encoding — pacing / health. Ahead is sky; on track is forest. */
export const STATUS = {
  ahead: BRAND.colour.sky,
  onTrack: BRAND.colour.forest,
  behind: BRAND.functional.amber,
  critical: BRAND.functional.coral,
} as const;

/**
 * Fixed media-channel hues. When a series is bound to a channel it keeps its
 * colour everywhere (don't let palette order reassign it).
 */
export const CHANNEL_COLORS: Record<string, string> = {
  television: BRAND.colour.forest,
  bvod: BRAND.colour.forest,
  social: BRAND.colour.sky,
  programmatic: BRAND.colour.lime,
  search: BRAND.colour.lime,
  display: BRAND.colour.lime,
  audio: BRAND.colour.muted,
  ooh: BRAND.colour.forestLight,
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

export const fmt = {
  /** 48210 → "48.2K", 2_410_000 → "2.4M" */
  compact: (n: number) => compactNF.format(n),
  /** 48210 → "$48.2K" */
  currencyCompact: (n: number) => formatMoneyCompact(n),
  /** 48210 → "$48,210" */
  currency: (n: number) => formatMoney(n, { decimals: 0 }),
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

export const CHART_FONT = [BRAND.font.sans, ...BRAND.font.sansFallback]
  .map((name) => (name.includes(' ') ? `'${name}'` : name))
  .join(', ');

export type ChartMode = 'light' | 'dark'

/** getComputedStyle transparent black. Kept here so chart files carry no colour literals. */
export const COMPUTED_TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** Dark series follows the family dark map (confidence 75%, morning smoke). */
const DARK_SERIES = [
  BRAND.colour.forestLight,
  BRAND.colour.sky,
  BRAND.colour.lime,
  BRAND.functional.forestTextOnBlack,
  BRAND.colour.mutedOnBlack,
  BRAND.colour.contextBlack,
  BRAND.colour.muted,
  BRAND.colour.context,
] as const

export function getChartTheme(mode: ChartMode) {
  const dark = mode === 'dark'
  return {
    series: dark ? DARK_SERIES : BRAND_SERIES,
    highlight: dark ? BRAND.colour.forestLight : BRAND.colour.forest,
    context: dark ? BRAND.colour.contextBlack : BRAND.colour.context,
    axisText: dark ? BRAND.colour.mutedOnBlack : BRAND.colour.muted,
    grid: dark ? BRAND.derived.lineOnBlack : BRAND.colour.line,
    valueLabel: dark ? BRAND.colour.white : BRAND.colour.ink,
    tooltip: {
      background: dark ? BRAND.colour.panel : BRAND.colour.white,
      border: dark ? BRAND.derived.lineOnBlack : BRAND.colour.line,
      text: dark ? BRAND.colour.white : BRAND.colour.ink,
    },
    font: CHART_FONT,
    barRadius: 999,
    barGap: 2,
  }
}

const DARK_FAMILY: Record<MediaFamily, string> = {
  video: BRAND.colour.forestLight,
  social: MEDIA_FAMILY.social.colour,
  search_display: MEDIA_FAMILY.search_display.colour,
  out_of_home: BRAND.functional.forestTextOnBlack,
  audio: BRAND.colour.mutedOnBlack,
  print: BRAND.colour.context,
  production: BRAND.colour.contextBlack,
}

export function familyColourFor(mode: ChartMode, mediaTypeKey: string): string {
  const key = mediaTypeKey.replace(/[^a-zA-Z]/g, '').toLowerCase()
  if (!(key in MEDIA_TYPE_FAMILY)) {
    return mode === 'dark' ? BRAND.colour.forestLight : BRAND.colour.forest
  }
  const family = MEDIA_TYPE_FAMILY[key as MediaTypeThemeKey]
  return mode === 'dark' ? DARK_FAMILY[family] : MEDIA_FAMILY[family].colour
}

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  return getChartTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
}

const CHANNEL_COLOR_ALIASES: Record<string, keyof typeof CHANNEL_COLORS> = {
  television: 'television',
  tv: 'television',
  bvod: 'bvod',
  progbvod: 'bvod',
  prog_bvod: 'bvod',
  social: 'social',
  socialmedia: 'social',
  social_media: 'social',
  search: 'search',
  ooh: 'ooh',
  progooh: 'ooh',
  prog_ooh: 'ooh',
  display: 'display',
  digidisplay: 'display',
  digital_display: 'display',
  programmatic: 'programmatic',
  progdisplay: 'programmatic',
  prog_display: 'programmatic',
  progvideo: 'programmatic',
  prog_video: 'programmatic',
  progaudio: 'programmatic',
  prog_audio: 'programmatic',
  audio: 'audio',
  digiaudio: 'audio',
  digital_audio: 'audio',
  radio: 'audio',
};

/**
 * Fixed channel hue for a media type or coarse aggregate.
 * Prefer `MEDIA_TYPE_REGISTRY` (family colour); then coarse `CHANNEL_COLORS`;
 * else palette by index.
 */
export function channelColorFor(key: string, index = 0): string {
  const registryKey = normalizeEntityKey(key) as MediaTypeRegistryKey;
  if (registryKey in MEDIA_TYPE_REGISTRY) {
    return getMediaColor(key);
  }
  const n = key.toLowerCase().replace(/[\s-]+/g, '_');
  const mapped = CHANNEL_COLOR_ALIASES[n] ?? (n in CHANNEL_COLORS ? (n as keyof typeof CHANNEL_COLORS) : undefined);
  if (mapped) return CHANNEL_COLORS[mapped];
  return seriesColor(index);
}

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
