import { CHANNELS, GEO_POP } from "./data";
import type { Channel, PlannerInputs, ScoredChannel, AllocatedChannel } from "./types";

function ageFit(ch: Channel, ageMin: number, ageMax: number): number {
  const audCenter = (ageMin + ageMax) / 2;
  const audSpread = (ageMax - ageMin) / 2;
  const overlap = 1 - Math.min(1, Math.abs(audCenter - ch.ageSkew.center) / (ch.ageSkew.spread + audSpread));
  return 0.7 + overlap * 0.6;
}

function genderFit(ch: Channel, gender: PlannerInputs["gender"]): number {
  if (gender === "all" || gender === "non-binary") return 1.0;
  return (ch.genderSkew[gender] || 100) / 100;
}

export function audienceSize(inputs: PlannerInputs): number {
  let pop = 0;
  inputs.geos.forEach((g) => { pop += GEO_POP[g] || 0; });
  const ageFrac = (inputs.ageMax - inputs.ageMin) / 85;
  const genderFrac = inputs.gender === "all" ? 1.0 : inputs.gender === "non-binary" ? 0.02 : 0.49;
  const segCount = inputs.segments.length;
  const segFrac = segCount === 0 ? 0 : Math.min(0.45, 0.08 + (segCount - 1) * 0.06);
  return pop * ageFrac * genderFrac * segFrac;
}

export function computeBcs(inputs: PlannerInputs): ScoredChannel[] {
  const O = inputs.objective / 100;
  const wSum = inputs.weights.A + inputs.weights.T + inputs.weights.E + inputs.weights.C || 1;
  const wA = inputs.weights.A / wSum;
  const wT = inputs.weights.T / wSum;
  const wE = inputs.weights.E / wSum;
  const wC = inputs.weights.C / wSum;
  if (inputs.segments.length === 0) return [];

  const scored = CHANNELS.map((ch): ScoredChannel => {
    const affAvg = inputs.segments.reduce((s, sg) => s + (ch.aff[sg] || 100), 0) / inputs.segments.length;
    const ageMod = ageFit(ch, inputs.ageMin, inputs.ageMax);
    const genderMod = genderFit(ch, inputs.gender);
    const A = Math.min(100, affAvg * 0.7 * ageMod * genderMod);
    const T = Math.min(100, ch.attn * 3.2);
    const E = (1 - O) * ch.B + O * ch.D;
    const valuePer = ((A / 100) * (T / 100) * 100) / ch.cpm;
    const C = Math.min(100, valuePer * 18);
    const bcs = wA * A + wT * T + wE * E + wC * C;
    return { ch, A, T, E, C, bcs, affAvg, ageMod, genderMod };
  });

  return scored.sort((a, b) => b.bcs - a.bcs);
}

export function allocate(scored: ScoredChannel[], budget: number): AllocatedChannel[] {
  const top = scored.slice(0, 8);
  const weights = top.map((s) => Math.pow(s.bcs / 100, 1.5));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return top.map((s, i) => ({
    ...s,
    pct: (weights[i] / total) * 100,
    dollars: Math.round((weights[i] / total) * budget / 1000) * 1000,
  }));
}

export function totalBcs(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.bcs * (a.pct / 100), 0);
}

export function totalReach(allocated: AllocatedChannel[]): number {
  return Math.min(82, allocated.reduce((s, a) => s + a.A * (a.pct / 100) * 0.85, 0));
}

export function totalAttention(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.attn * (a.pct / 100), 0);
}

export function effectiveCpm(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.cpm * (a.pct / 100), 0);
}
