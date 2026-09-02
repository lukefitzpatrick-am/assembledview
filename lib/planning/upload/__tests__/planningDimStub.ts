import type { PlanningBench, PlanningChannelMeta, PlanningMeta } from "../../types"

const emptyBench: PlanningBench = {
  attn: null,
  brand_effect: null,
  direct_effect: null,
  cpm: null,
}

function ch(
  channel_id: string,
  level1: string | null,
  level2: string | null,
  sort_order: number,
  engine_channel_id: string | null,
  age_base = 14,
  bench: PlanningBench = emptyBench
): PlanningChannelMeta {
  return {
    channel_id,
    level1,
    level2,
    sort_order,
    is_rm_measured: engine_channel_id != null,
    age_base,
    engine_channel_id,
    bench,
  }
}

const numberedBench = (attn: number): PlanningBench => ({
  attn,
  brand_effect: 50,
  direct_effect: 50,
  cpm: 20,
})

/** 6 rollups + 21 engine leaves (20 RM + search) + POPULATION. */
export const STUB_PLANNING_CHANNELS: PlanningChannelMeta[] = [
  ch("POPULATION", null, null, 0, null),
  ch("video_total", "Video", "Total", 1, null),
  ch("tv_fta", "Video", "FTA", 2, "tv", 14, numberedBench(18)),
  ch("bvod", "Video", "BVOD", 3, "bvod", 14, numberedBench(24)),
  ch("paytv", "Video", "Pay TV", 4, "paytv", 14, numberedBench(19)),
  ch("svod", "Video", "SVOD", 5, "svod", 14, numberedBench(22)),
  ch("youtube", "Video", "YouTube", 6, "youtube", 18, numberedBench(13)),
  ch("audio_total", "Audio", "Total", 10, null),
  ch("radio", "Audio", "Radio", 11, "radio", 14, numberedBench(14)),
  ch("streaming", "Audio", "Streaming", 12, "streaming", 14, numberedBench(16)),
  ch("podcasts", "Audio", "Podcasts", 13, "podcasts", 14, numberedBench(20)),
  ch("news_total", "News", "Total", 20, null),
  ch("news_print", "News", "Print", 21, "news_print", 14, numberedBench(22)),
  ch("news_digital", "News", "Digital", 22, "news_digital", 14, numberedBench(6)),
  ch("mags_total", "Magazines", "Total", 30, null),
  ch("mags_print", "Magazines", "Print", 31, "mags_print", 14, numberedBench(24)),
  ch("mags_digital", "Magazines", "Digital", 32, "mags_digital", 14, numberedBench(5)),
  ch("ooh_total", "Outdoor", "Total", 40, null),
  ch("ooh_street", "Outdoor", "Street furniture", 41, "ooh_street", 14, numberedBench(6)),
  ch("ooh_billboard", "Outdoor", "Billboards", 42, "ooh_billboard", 14, numberedBench(8)),
  ch("ooh_shopping", "Outdoor", "Shopping centres", 43, "ooh_shopping", 14, numberedBench(7)),
  ch("ooh_transit", "Outdoor", "Transit", 44, "ooh_transit", 14, numberedBench(6)),
  ch("social_total", "Social", "Total", 50, null),
  ch("facebook", "Social", "Facebook", 51, "facebook", 18, numberedBench(8)),
  ch("instagram", "Social", "Instagram", 52, "instagram", 18, numberedBench(10)),
  ch("cinema", "Cinema", "Cinema", 60, "cinema", 14, numberedBench(28)),
  ch("digital_other", "Digital", "Other websites", 70, "digital_other", 14, numberedBench(4)),
  ch("search", "Search", "Search", 80, "search", 14, numberedBench(7)),
]

export const STUB_PLANNING_META: PlanningMeta = {
  waves: [],
  segments: [{ segment_id: "seg_upload", name: "Uploaded", is_intersection: false, notes: null }],
  channels: STUB_PLANNING_CHANNELS,
  states: ["NAT"],
  age_bands: ["14-24", "25-34", "35-49", "50-64", "65+"],
  genders: ["male", "female"],
  methodology: [],
  engine_params: {},
}

export const ENGINE_LEAF_IDS = STUB_PLANNING_CHANNELS.filter(
  (c) => c.engine_channel_id != null && c.engine_channel_id !== ""
).map((c) => c.channel_id)
