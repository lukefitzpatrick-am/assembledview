/**
 * B31fix2 M1: a seeded generator for the FC9 and C-185 random tests.
 *
 * The B31 tests used `seed = (seed * 1103515245 + 12345) % 2^31` in JS
 * doubles. The product passes 2^53 and is rounded, so the seed sits at
 * 0 mod 8 almost every step and `seed % 4` is 0 about 99.5% of the time: the
 * "300 random dated plans" test built 1 plan cell and split 0 months.
 *
 * mulberry32 runs in 32-bit integer maths (`Math.imul`), so every draw is
 * exact and the same on every machine. Draws use the full 32-bit output
 * scaled to the range, not a modulus of the low bits.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type SeededInts = {
  /** 0 to n - 1. */
  int: (n: number) => number
  /** -n to n. */
  signed: (n: number) => number
  /** True with probability p. */
  chance: (p: number) => boolean
}

export function seededInts(seed: number): SeededInts {
  const next = mulberry32(seed)
  return {
    int: (n) => Math.floor(next() * n),
    signed: (n) => Math.floor(next() * (2 * n + 1)) - n,
    chance: (p) => next() < p,
  }
}
