/**
 * Named per-pillar planning bench seeds (PLANNING_CHANNEL_BENCH).
 * Used when audience/meta responses have null bench fields for an engine channel.
 * Per-pillar `source` is provenance, not influence. Warehouse ATTN_SOURCE / … are P7-8.
 */

export const PLANNING_CHANNEL_BENCH_VERSION = "assembled-seed-v1"

/** Fallback provenance string when warehouse per-pillar sources are not yet wired. */
export const ASSEMBLED_SEED_SOURCE = "Assembled seed — pending warehouse source"

/** Client-side Search row — benchmark-only, not Roy Morgan. */
export const SEARCH_ENGINE_CHANNEL_ID = "search"

export type BenchPillar = {
  value: number
  source: string
}

export type PlanningChannelBenchRow = {
  name: string
  color: string
  attn: BenchPillar
  brand_effect: BenchPillar
  direct_effect: BenchPillar
  cpm: BenchPillar
}

function pillar(value: number, source: string = ASSEMBLED_SEED_SOURCE): BenchPillar {
  return { value, source }
}

export const PLANNING_CHANNEL_BENCH: Record<string, PlanningChannelBenchRow> = {
  tv: {
    name: "Broadcast TV",
    color: "var(--channel-tv)",
    attn: pillar(18),
    brand_effect: pillar(85),
    direct_effect: pillar(35),
    cpm: pillar(38),
  },
  paytv: {
    name: "Pay TV",
    color: "var(--channel-tv)",
    attn: pillar(19),
    brand_effect: pillar(80),
    direct_effect: pillar(38),
    cpm: pillar(42),
  },
  bvod: {
    name: "BVOD",
    color: "var(--channel-bvod)",
    attn: pillar(24),
    brand_effect: pillar(78),
    direct_effect: pillar(58),
    cpm: pillar(52),
  },
  svod: {
    name: "SVOD",
    color: "var(--channel-bvod)",
    attn: pillar(22),
    brand_effect: pillar(76),
    direct_effect: pillar(52),
    cpm: pillar(55),
  },
  youtube: {
    name: "YouTube",
    color: "var(--channel-tv)",
    attn: pillar(13),
    brand_effect: pillar(70),
    direct_effect: pillar(60),
    cpm: pillar(22),
  },
  radio: {
    name: "Radio",
    color: "var(--pacing-behind)",
    attn: pillar(14),
    brand_effect: pillar(62),
    direct_effect: pillar(55),
    cpm: pillar(22),
  },
  streaming: {
    name: "Music streaming",
    color: "var(--pacing-behind)",
    attn: pillar(16),
    brand_effect: pillar(60),
    direct_effect: pillar(62),
    cpm: pillar(28),
  },
  podcasts: {
    name: "Podcasts",
    color: "var(--pacing-behind)",
    attn: pillar(20),
    brand_effect: pillar(66),
    direct_effect: pillar(60),
    cpm: pillar(32),
  },
  news_print: {
    name: "News (print)",
    color: "var(--channel-prog-display)",
    attn: pillar(22),
    brand_effect: pillar(68),
    direct_effect: pillar(30),
    cpm: pillar(55),
  },
  news_digital: {
    name: "News (digital)",
    color: "var(--channel-prog-display)",
    attn: pillar(6),
    brand_effect: pillar(55),
    direct_effect: pillar(55),
    cpm: pillar(14),
  },
  mags_print: {
    name: "Magazines (print)",
    color: "var(--channel-prog-display)",
    attn: pillar(24),
    brand_effect: pillar(72),
    direct_effect: pillar(28),
    cpm: pillar(60),
  },
  mags_digital: {
    name: "Magazines (digital)",
    color: "var(--channel-prog-display)",
    attn: pillar(5),
    brand_effect: pillar(52),
    direct_effect: pillar(50),
    cpm: pillar(12),
  },
  ooh_street: {
    name: "Street furniture",
    color: "var(--channel-ooh)",
    attn: pillar(6),
    brand_effect: pillar(58),
    direct_effect: pillar(48),
    cpm: pillar(14),
  },
  ooh_billboard: {
    name: "Billboards",
    color: "var(--channel-ooh)",
    attn: pillar(8),
    brand_effect: pillar(72),
    direct_effect: pillar(42),
    cpm: pillar(18),
  },
  ooh_shopping: {
    name: "Shopping centres",
    color: "var(--channel-ooh)",
    attn: pillar(7),
    brand_effect: pillar(60),
    direct_effect: pillar(62),
    cpm: pillar(16),
  },
  ooh_transit: {
    name: "Transit",
    color: "var(--channel-ooh)",
    attn: pillar(6),
    brand_effect: pillar(60),
    direct_effect: pillar(45),
    cpm: pillar(12),
  },
  facebook: {
    name: "Facebook",
    color: "var(--channel-social)",
    attn: pillar(8),
    brand_effect: pillar(52),
    direct_effect: pillar(80),
    cpm: pillar(11),
  },
  instagram: {
    name: "Instagram",
    color: "var(--channel-social)",
    attn: pillar(10),
    brand_effect: pillar(58),
    direct_effect: pillar(75),
    cpm: pillar(13),
  },
  digital_other: {
    name: "Content sites",
    color: "var(--channel-prog-display)",
    attn: pillar(4),
    brand_effect: pillar(42),
    direct_effect: pillar(65),
    cpm: pillar(8),
  },
  search: {
    name: "Search",
    color: "var(--channel-search)",
    attn: pillar(7),
    brand_effect: pillar(30),
    direct_effect: pillar(92),
    cpm: pillar(35),
  },
  cinema: {
    name: "Cinema",
    color: "var(--channel-bvod)",
    attn: pillar(28),
    brand_effect: pillar(88),
    direct_effect: pillar(32),
    cpm: pillar(45),
  },
}
