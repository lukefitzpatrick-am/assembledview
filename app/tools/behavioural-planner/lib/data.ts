import type { GeoId } from "./types";

export const FLIGHTS = [
  { id: "q3-2026" as const, label: "Aug-Oct 2026 (AFL/NRL finals)" },
  { id: "q4-2026" as const, label: "Nov 2026 - Jan 2027 (festive)" },
  { id: "q1-2026" as const, label: "Feb-Apr 2026 (Aus Open lead)" },
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
