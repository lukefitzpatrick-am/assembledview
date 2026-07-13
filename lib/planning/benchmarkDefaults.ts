/**
 * Prototype seed values, pending PLANNING_CHANNEL_BENCH.
 * Sourced from live engine_channel_id diagnostic + directional attn/B/D/cpm seeds.
 * Used only when the audience/meta response has null bench fields for an engine channel.
 */

export type BenchmarkDefault = {
  name: string
  attn: number
  B: number
  D: number
  cpm: number
  color: string
}

export const BENCHMARK_DEFAULTS: Record<string, BenchmarkDefault> = {
  tv: {
    name: "Broadcast TV",
    attn: 18,
    B: 85,
    D: 35,
    cpm: 38,
    color: "var(--channel-tv)",
  },
  paytv: {
    name: "Pay TV",
    attn: 19,
    B: 80,
    D: 38,
    cpm: 42,
    color: "var(--channel-tv)",
  },
  bvod: {
    name: "BVOD",
    attn: 24,
    B: 78,
    D: 58,
    cpm: 52,
    color: "var(--channel-bvod)",
  },
  svod: {
    name: "SVOD",
    attn: 22,
    B: 76,
    D: 52,
    cpm: 55,
    color: "var(--channel-bvod)",
  },
  youtube: {
    name: "YouTube",
    attn: 13,
    B: 70,
    D: 60,
    cpm: 22,
    color: "var(--channel-tv)",
  },
  radio: {
    name: "Radio",
    attn: 14,
    B: 62,
    D: 55,
    cpm: 22,
    color: "var(--pacing-behind)",
  },
  streaming: {
    name: "Music streaming",
    attn: 16,
    B: 60,
    D: 62,
    cpm: 28,
    color: "var(--pacing-behind)",
  },
  podcasts: {
    name: "Podcasts",
    attn: 20,
    B: 66,
    D: 60,
    cpm: 32,
    color: "var(--pacing-behind)",
  },
  news_print: {
    name: "News (print)",
    attn: 22,
    B: 68,
    D: 30,
    cpm: 55,
    color: "var(--channel-prog-display)",
  },
  news_digital: {
    name: "News (digital)",
    attn: 6,
    B: 55,
    D: 55,
    cpm: 14,
    color: "var(--channel-prog-display)",
  },
  mags_print: {
    name: "Magazines (print)",
    attn: 24,
    B: 72,
    D: 28,
    cpm: 60,
    color: "var(--channel-prog-display)",
  },
  mags_digital: {
    name: "Magazines (digital)",
    attn: 5,
    B: 52,
    D: 50,
    cpm: 12,
    color: "var(--channel-prog-display)",
  },
  ooh_street: {
    name: "Street furniture",
    attn: 6,
    B: 58,
    D: 48,
    cpm: 14,
    color: "var(--channel-ooh)",
  },
  ooh_billboard: {
    name: "Billboards",
    attn: 8,
    B: 72,
    D: 42,
    cpm: 18,
    color: "var(--channel-ooh)",
  },
  ooh_shopping: {
    name: "Shopping centres",
    attn: 7,
    B: 60,
    D: 62,
    cpm: 16,
    color: "var(--channel-ooh)",
  },
  ooh_transit: {
    name: "Transit",
    attn: 6,
    B: 60,
    D: 45,
    cpm: 12,
    color: "var(--channel-ooh)",
  },
  facebook: {
    name: "Facebook",
    attn: 8,
    B: 52,
    D: 80,
    cpm: 11,
    color: "var(--channel-social)",
  },
  instagram: {
    name: "Instagram",
    attn: 10,
    B: 58,
    D: 75,
    cpm: 13,
    color: "var(--channel-social)",
  },
  digital_other: {
    name: "Content sites",
    attn: 4,
    B: 42,
    D: 65,
    cpm: 8,
    color: "var(--channel-prog-display)",
  },
  search: {
    name: "Search",
    attn: 7,
    B: 30,
    D: 92,
    cpm: 35,
    color: "var(--channel-search)",
  },
  cinema: {
    name: "Cinema",
    attn: 28,
    B: 88,
    D: 32,
    cpm: 45,
    color: "var(--channel-bvod)",
  },
}

/** Client-side Search row — benchmark-only, not Roy Morgan. */
export const SEARCH_ENGINE_CHANNEL_ID = "search"
