export type SegmentId =
  | "aspirationals"
  | "socially-aware"
  | "traditional-family"
  | "visible-achievement"
  | "young-optimism"
  | "something-better"
  | "conventional-family"
  | "real-conservatism";

export type GeoId = "au" | "nsw" | "vic" | "qld" | "wa" | "sa" | "tas" | "act" | "nt";

export type Gender = "all" | "female" | "male" | "non-binary";

export type FlightId = "q1-2026" | "q3-2026" | "q4-2026";

export interface Channel {
  id: string;
  name: string;
  attn: number; // active attention seconds per exposure (aAPM proxy)
  B: number; // brand effect score 0-100
  D: number; // direct action effect score 0-100
  cpm: number; // AUD CPM
  color: string; // CSS colour token for bar swatch
  aff: Record<SegmentId, number>; // affinity index, 100 = baseline
  ageSkew: { center: number; spread: number };
  genderSkew: { female: number; male: number };
}

export interface CulturalMoment {
  date: string;
  flight: FlightId;
  title: string;
  desc: string;
  chans: string[];
  geos: GeoId[];
}

export interface Weights {
  A: number;
  T: number;
  E: number;
  C: number;
}

export interface PlannerInputs {
  objective: number; // 0-100 slider
  segments: SegmentId[];
  weights: Weights;
  flight: FlightId;
  budget: number; // AUD
  ageMin: number;
  ageMax: number;
  gender: Gender;
  geos: GeoId[];
}

export interface ScoredChannel {
  ch: Channel;
  A: number;
  T: number;
  E: number;
  C: number;
  bcs: number;
  affAvg: number;
  ageMod: number;
  genderMod: number;
}

export interface AllocatedChannel extends ScoredChannel {
  pct: number;
  dollars: number;
}
