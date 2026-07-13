import type { CulturalMoment, GeoId } from "./types";

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

/** Map planning API states → cultural-moments GeoId tags. */
export const STATE_TO_GEO: Record<string, GeoId> = {
  NAT: "au",
  NSW: "nsw",
  VIC: "vic",
  QLD: "qld",
  SA: "sa",
  WA: "wa",
  TAS: "tas",
  NT: "nt",
};

export const DEFAULT_INPUTS = {
  objective: 35,
  weights: { A: 30, T: 25, E: 30, C: 15 },
  flight: "q3-2026" as const,
  budget: 850000,
  gender: "all" as const,
  campaignName: "Switch Co. Trial Campaign",
  successMetric: "Trial / first purchase",
  /** Default age bands 25-34 + 35-49 (D6 acceptance window). */
  ageBands: ["25-34", "35-49"] as const,
  states: ["NAT"] as const,
  reachBasis: "addressable" as const,
};
