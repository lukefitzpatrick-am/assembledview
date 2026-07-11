/**
 * Prototype seed values, pending PLANNING_CHANNEL_BENCH.
 * Sourced from the behavioural-planner mock catalogue (attn / B / D / cpm / name / color).
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
  bvod: {
    name: "BVOD",
    attn: 24,
    B: 78,
    D: 58,
    cpm: 52,
    color: "var(--channel-bvod)",
  },
  "ooh-lg": {
    name: "OOH (large format)",
    attn: 8,
    B: 72,
    D: 42,
    cpm: 18,
    color: "var(--channel-ooh)",
  },
  "ooh-st": {
    name: "OOH (street/transit)",
    attn: 6,
    B: 58,
    D: 48,
    cpm: 14,
    color: "var(--channel-ooh)",
  },
  "audio-br": {
    name: "Broadcast radio",
    attn: 14,
    B: 62,
    D: 55,
    cpm: 22,
    color: "var(--pacing-behind)",
  },
  "audio-dig": {
    name: "Digital audio",
    attn: 16,
    B: 60,
    D: 62,
    cpm: 28,
    color: "var(--pacing-behind)",
  },
  "social-m": {
    name: "Meta (FB/IG)",
    attn: 9,
    B: 55,
    D: 78,
    cpm: 12,
    color: "var(--channel-social)",
  },
  "social-t": {
    name: "TikTok",
    attn: 11,
    B: 58,
    D: 72,
    cpm: 15,
    color: "var(--channel-social)",
  },
  youtube: {
    name: "YouTube",
    attn: 13,
    B: 70,
    D: 60,
    cpm: 22,
    color: "var(--channel-tv)",
  },
  search: {
    name: "Search",
    attn: 7,
    B: 30,
    D: 92,
    cpm: 35,
    color: "var(--channel-search)",
  },
  display: {
    name: "Programmatic display",
    attn: 4,
    B: 42,
    D: 65,
    cpm: 8,
    color: "var(--channel-prog-display)",
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
