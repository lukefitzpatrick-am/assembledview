/**
 * AssembledView — chart geometry helpers
 * Pure functions for the custom-SVG charts (sunburst, marimekko, heatmap,
 * waterfall maths). No React, no Recharts.
 */

export const round = (n: number) => Math.round(n * 100) / 100;

/** Catmull-Rom → cubic-bezier smoothing through points. */
export function smoothPath(p: [number, number][]): string {
  if (p.length < 3) return p.map((q, i) => (i ? 'L' : 'M') + round(q[0]) + ' ' + round(q[1])).join(' ');
  let d = 'M' + round(p[0][0]) + ' ' + round(p[0][1]);
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ' C' + round(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + round(p1[1] + (p2[1] - p0[1]) / 6) +
         ' ' + round(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + round(p2[1] - (p3[1] - p1[1]) / 6) +
         ' ' + round(p2[0]) + ' ' + round(p2[1]);
  }
  return d;
}

/** Straight polyline through points. */
export const polyline = (p: [number, number][]) =>
  p.map((q, i) => (i ? 'L' : 'M') + round(q[0]) + ' ' + round(q[1])).join(' ');

/** Annular-sector (donut/sunburst wedge) path. Angles in radians, 0 = 3 o'clock. */
export function annularSector(
  cx: number, cy: number, r0: number, r1: number, a0: number, a1: number,
): string {
  const pt = (a: number, rad: number): [number, number] => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const A = pt(a0, r1), B = pt(a1, r1), C = pt(a1, r0), D = pt(a0, r0);
  return `M${round(A[0])} ${round(A[1])} A${r1} ${r1} 0 ${big} 1 ${round(B[0])} ${round(B[1])} ` +
         `L${round(C[0])} ${round(C[1])} A${r0} ${r0} 0 ${big} 0 ${round(D[0])} ${round(D[1])} Z`;
}

/** Linear scale factory. */
export const scale = (d0: number, d1: number, r0: number, r1: number) =>
  (v: number) => r0 + (r1 - r0) * (v - d0) / (d1 - d0 || 1);

/** Deterministic PRNG (seeded) — stable demo data for heatmaps etc. */
export function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Waterfall: turn signed deltas into floating [base, top, kind] bars. */
export type WaterfallStep = { label: string; value: number; kind?: 'total' | 'delta' | 'end' };
export function waterfallBars(steps: WaterfallStep[]) {
  let run = 0;
  return steps.map((s) => {
    let base: number, top: number, kind = s.kind ?? 'delta';
    if (kind === 'total') { base = 0; top = s.value; run = s.value; }
    else if (kind === 'end') { base = 0; top = run; }
    else { base = run; top = run + s.value; run += s.value; }
    return { ...s, base: Math.min(base, top), top: Math.max(base, top), rise: s.value >= 0, kind };
  });
}
