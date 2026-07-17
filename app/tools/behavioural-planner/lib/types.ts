export type Gender = "all" | "female" | "male";

export type FlightId = "q1-2026" | "q3-2026" | "q4-2026";

/** Kept for CulturalMoments seed geo tags (deferred calendar). */
export type GeoId = "au" | "nsw" | "vic" | "qld" | "wa" | "sa" | "tas" | "act" | "nt";

export interface ChannelPillarSources {
  /** Affinity A: Roy Morgan when measured; else assembled seed. */
  A: string;
  /** Attention T: always bench (never RM). */
  T: string;
  /** Effect E (from B/D): always bench. */
  E: string;
  /** Cost C (from CPM): always bench. */
  C: string;
}

export interface Channel {
  id: string;
  name: string;
  attn: number; // active attention seconds per exposure (aAPM proxy)
  B: number; // brand effect score 0-100
  D: number; // direct action effect score 0-100
  cpm: number; // AUD CPM
  color: string; // CSS colour token for bar swatch
  /** Affinity index keyed by segment_id; 100 = baseline. */
  aff: Record<string, number>;
  /** From API age_fit (phase 1: always 1.0). */
  ageMod: number;
  /** From API gender_fit (phase 1: always 1.0). */
  genderMod: number;
  /** Real RM reach fraction 0..1. */
  reachPct: number;
  /** Reach weighted count in '000s (from API). */
  reachWc?: number;
  isRmMeasured: boolean;
  ageBase: number;
  /** Per-pillar provenance for UI/deck (not BCS weights). */
  pillarSources?: ChannelPillarSources;
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
  /** Single segment lens id (non-additive). */
  segments: string[];
  weights: Weights;
  flight: FlightId;
  budget: number; // AUD
  ageMin: number;
  ageMax: number;
  gender: Gender;
  /** Mapped from planning states for Ava / cultural moments display. */
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
