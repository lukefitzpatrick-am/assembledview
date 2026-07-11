import type { Channel, PlannerInputs, ScoredChannel, AllocatedChannel } from "./types";

/**
 * BCS scoring over adapted live channels (affinities + age/gender fits from the API).
 * Does not invent audience size or reach — those come from the audience adapter.
 */
export function computeBcs(inputs: PlannerInputs, channels: Channel[]): ScoredChannel[] {
  const O = inputs.objective / 100;
  const wSum = inputs.weights.A + inputs.weights.T + inputs.weights.E + inputs.weights.C || 1;
  const wA = inputs.weights.A / wSum;
  const wT = inputs.weights.T / wSum;
  const wE = inputs.weights.E / wSum;
  const wC = inputs.weights.C / wSum;
  if (inputs.segments.length === 0) return [];

  const scored = channels.map((ch): ScoredChannel => {
    const affAvg =
      inputs.segments.reduce((s, sg) => s + (ch.aff[sg] ?? 100), 0) / inputs.segments.length;
    const ageMod = ch.ageMod;
    const genderMod = ch.genderMod;
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

/** Mix-weighted real RM reach % (0–100). No fictional cap. */
export function totalReach(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.reachPct * 100 * (a.pct / 100), 0);
}

export function totalAttention(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.attn * (a.pct / 100), 0);
}

export function effectiveCpm(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.cpm * (a.pct / 100), 0);
}
