import type { Channel, CulturalMoment, GeoId } from "./types";

export const CHANNELS: Channel[] = [
  { id: "tv", name: "Broadcast TV", attn: 18, B: 85, D: 35, cpm: 38, color: "var(--channel-tv)",
    aff: { aspirationals: 95, "socially-aware": 82, "traditional-family": 128, "visible-achievement": 105, "young-optimism": 65, "something-better": 110, "conventional-family": 135, "real-conservatism": 142 },
    ageSkew: { center: 52, spread: 25 }, genderSkew: { female: 105, male: 95 } },
  { id: "bvod", name: "BVOD", attn: 24, B: 78, D: 58, cpm: 52, color: "var(--channel-bvod)",
    aff: { aspirationals: 138, "socially-aware": 122, "traditional-family": 95, "visible-achievement": 130, "young-optimism": 142, "something-better": 115, "conventional-family": 92, "real-conservatism": 78 },
    ageSkew: { center: 38, spread: 22 }, genderSkew: { female: 108, male: 92 } },
  { id: "ooh-lg", name: "OOH (large format)", attn: 8, B: 72, D: 42, cpm: 18, color: "var(--channel-ooh)",
    aff: { aspirationals: 118, "socially-aware": 105, "traditional-family": 92, "visible-achievement": 132, "young-optimism": 115, "something-better": 100, "conventional-family": 95, "real-conservatism": 88 },
    ageSkew: { center: 40, spread: 28 }, genderSkew: { female: 100, male: 100 } },
  { id: "ooh-st", name: "OOH (street/transit)", attn: 6, B: 58, D: 48, cpm: 14, color: "var(--channel-ooh)",
    aff: { aspirationals: 122, "socially-aware": 128, "traditional-family": 78, "visible-achievement": 118, "young-optimism": 135, "something-better": 105, "conventional-family": 82, "real-conservatism": 72 },
    ageSkew: { center: 32, spread: 18 }, genderSkew: { female: 102, male: 98 } },
  { id: "audio-br", name: "Broadcast radio", attn: 14, B: 62, D: 55, cpm: 22, color: "var(--pacing-behind)",
    aff: { aspirationals: 92, "socially-aware": 85, "traditional-family": 132, "visible-achievement": 98, "young-optimism": 72, "something-better": 115, "conventional-family": 138, "real-conservatism": 145 },
    ageSkew: { center: 50, spread: 22 }, genderSkew: { female: 98, male: 102 } },
  { id: "audio-dig", name: "Digital audio", attn: 16, B: 60, D: 62, cpm: 28, color: "var(--pacing-behind)",
    aff: { aspirationals: 128, "socially-aware": 132, "traditional-family": 85, "visible-achievement": 115, "young-optimism": 145, "something-better": 108, "conventional-family": 78, "real-conservatism": 68 },
    ageSkew: { center: 32, spread: 18 }, genderSkew: { female: 100, male: 100 } },
  { id: "social-m", name: "Meta (FB/IG)", attn: 9, B: 55, D: 78, cpm: 12, color: "var(--channel-social)",
    aff: { aspirationals: 125, "socially-aware": 118, "traditional-family": 108, "visible-achievement": 122, "young-optimism": 138, "something-better": 115, "conventional-family": 105, "real-conservatism": 88 },
    ageSkew: { center: 38, spread: 22 }, genderSkew: { female: 118, male: 82 } },
  { id: "social-t", name: "TikTok", attn: 11, B: 58, D: 72, cpm: 15, color: "var(--channel-social)",
    aff: { aspirationals: 105, "socially-aware": 95, "traditional-family": 72, "visible-achievement": 92, "young-optimism": 158, "something-better": 88, "conventional-family": 65, "real-conservatism": 52 },
    ageSkew: { center: 26, spread: 12 }, genderSkew: { female: 115, male: 85 } },
  { id: "youtube", name: "YouTube", attn: 13, B: 70, D: 60, cpm: 22, color: "var(--channel-tv)",
    aff: { aspirationals: 122, "socially-aware": 128, "traditional-family": 92, "visible-achievement": 118, "young-optimism": 148, "something-better": 112, "conventional-family": 88, "real-conservatism": 75 },
    ageSkew: { center: 34, spread: 20 }, genderSkew: { female: 95, male: 105 } },
  { id: "search", name: "Search", attn: 7, B: 30, D: 92, cpm: 35, color: "var(--channel-search)",
    aff: { aspirationals: 115, "socially-aware": 110, "traditional-family": 105, "visible-achievement": 118, "young-optimism": 108, "something-better": 125, "conventional-family": 108, "real-conservatism": 100 },
    ageSkew: { center: 40, spread: 24 }, genderSkew: { female: 100, male: 100 } },
  { id: "display", name: "Programmatic display", attn: 4, B: 42, D: 65, cpm: 8, color: "var(--channel-prog-display)",
    aff: { aspirationals: 102, "socially-aware": 100, "traditional-family": 98, "visible-achievement": 105, "young-optimism": 112, "something-better": 100, "conventional-family": 95, "real-conservatism": 92 },
    ageSkew: { center: 40, spread: 25 }, genderSkew: { female: 100, male: 100 } },
  { id: "cinema", name: "Cinema", attn: 28, B: 88, D: 32, cpm: 45, color: "var(--channel-bvod)",
    aff: { aspirationals: 132, "socially-aware": 125, "traditional-family": 88, "visible-achievement": 128, "young-optimism": 145, "something-better": 102, "conventional-family": 82, "real-conservatism": 72 },
    ageSkew: { center: 30, spread: 16 }, genderSkew: { female: 102, male: 98 } },
];

export const SEGMENTS = [
  { id: "aspirationals" as const, label: "Aspirational achievers" },
  { id: "socially-aware" as const, label: "Socially aware" },
  { id: "traditional-family" as const, label: "Traditional family life" },
  { id: "visible-achievement" as const, label: "Visible achievement" },
  { id: "young-optimism" as const, label: "Young optimism" },
  { id: "something-better" as const, label: "Looking for something better" },
  { id: "conventional-family" as const, label: "Conventional family life" },
  { id: "real-conservatism" as const, label: "Real conservatism" },
];

export const GEOS: { id: GeoId; label: string }[] = [
  { id: "au", label: "Australia (national)" },
  { id: "nsw", label: "NSW" },
  { id: "vic", label: "VIC" },
  { id: "qld", label: "QLD" },
  { id: "wa", label: "WA" },
  { id: "sa", label: "SA" },
  { id: "tas", label: "TAS" },
  { id: "act", label: "ACT" },
  { id: "nt", label: "NT" },
];

export const GEO_POP: Record<GeoId, number> = {
  au: 26.8, nsw: 8.4, vic: 6.9, qld: 5.5, wa: 2.9, sa: 1.85, tas: 0.58, act: 0.47, nt: 0.25,
};

export const FLIGHTS = [
  { id: "q3-2026" as const, label: "Aug-Oct 2026 (AFL/NRL finals)" },
  { id: "q4-2026" as const, label: "Nov 2026 - Jan 2027 (festive)" },
  { id: "q1-2026" as const, label: "Feb-Apr 2026 (Aus Open lead)" },
];

export const SUCCESS_METRICS = [
  "Trial / first purchase",
  "Brand consideration lift",
  "Awareness lift",
  "Store visit",
  "Signup",
];

export const CULTURAL_MOMENTS: CulturalMoment[] = [
  { date: "Aug 2026", flight: "q3-2026", title: "AFL finals series", desc: "Peak audience for premium video; brand association window", chans: ["Broadcast TV", "BVOD"], geos: ["vic", "sa", "wa"] },
  { date: "Aug 2026", flight: "q3-2026", title: "NRL finals series", desc: "NSW/QLD audience concentration, secondary screen behaviour", chans: ["Broadcast TV", "BVOD", "Social"], geos: ["nsw", "qld"] },
  { date: "Sep 2026", flight: "q3-2026", title: "Father's Day (6 Sep)", desc: "Retail-trial moment for FMCG and consumer goods", chans: ["Search", "Meta", "OOH"], geos: ["au"] },
  { date: "Sep 2026", flight: "q3-2026", title: "AFL Grand Final week", desc: "Largest single AU broadcast event - captive attention", chans: ["Broadcast TV", "OOH", "Digital audio"], geos: ["au"] },
  { date: "Sep 2026", flight: "q3-2026", title: "School holidays (VIC)", desc: "Family travel, cinema attendance up 40%", chans: ["Cinema", "BVOD", "YouTube"], geos: ["vic"] },
  { date: "Oct 2026", flight: "q3-2026", title: "Spring racing carnival", desc: "Premium audience, fashion/lifestyle category halo", chans: ["OOH (large)", "BVOD", "Social"], geos: ["vic"] },
  { date: "Oct 2026", flight: "q3-2026", title: "NRL Grand Final", desc: "NSW/QLD peak - premium TV inventory window", chans: ["Broadcast TV", "BVOD"], geos: ["nsw", "qld"] },
  { date: "Nov 2026", flight: "q4-2026", title: "Melbourne Cup (Tue 3 Nov)", desc: "National stop-work moment - high attention TV + OOH", chans: ["Broadcast TV", "OOH", "Digital audio"], geos: ["au"] },
  { date: "Nov 2026", flight: "q4-2026", title: "Black Friday / Cyber", desc: "Largest AU retail action window; high-intent search spike", chans: ["Search", "Meta", "TikTok"], geos: ["au"] },
  { date: "Dec 2026", flight: "q4-2026", title: "Christmas trading peak", desc: "50% of FMCG annual sales in 6-week window", chans: ["Broadcast TV", "BVOD", "Search", "OOH"], geos: ["au"] },
  { date: "Jan 2027", flight: "q4-2026", title: "Australian Open", desc: "3-week premium video event, hot weather OOH dwell", chans: ["Broadcast TV", "BVOD", "OOH"], geos: ["au"] },
  { date: "Feb 2026", flight: "q1-2026", title: "Back-to-school", desc: "Family purchase decisions cluster late Jan - early Feb", chans: ["Search", "Meta", "OOH (street)"], geos: ["au"] },
  { date: "Mar 2026", flight: "q1-2026", title: "Mardi Gras (Sydney)", desc: "Socially-aware segment concentration; cultural relevance", chans: ["Social", "OOH", "BVOD"], geos: ["nsw"] },
  { date: "Mar 2026", flight: "q1-2026", title: "AFL/NRL season opener", desc: "Reset moment for premium video annual deals", chans: ["Broadcast TV", "BVOD"], geos: ["au"] },
  { date: "Apr 2026", flight: "q1-2026", title: "Easter trading", desc: "Travel + retail dual peak; long-weekend behaviour", chans: ["OOH", "Digital audio", "Meta"], geos: ["au"] },
];

export const DEFAULT_INPUTS = {
  objective: 35,
  segments: ["aspirationals", "socially-aware"] as const,
  weights: { A: 30, T: 25, E: 30, C: 15 },
  flight: "q3-2026" as const,
  budget: 850000,
  ageMin: 25,
  ageMax: 49,
  gender: "all" as const,
  geos: ["au"] as const,
  campaignName: "Switch Co. Trial Campaign",
  successMetric: "Trial / first purchase",
};
