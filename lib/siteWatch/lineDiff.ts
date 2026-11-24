export type LineDiff = { lines: string[]; total: number }

/** Above this many cells the middle is reported as all removed then all added. */
const LCS_CELL_LIMIT = 4_000_000

/**
 * Line diff of two texts as `- old` / `+ new` lines, the first `limit` kept
 * and `total` counting all of them. Common head and tail are trimmed first,
 * then a plain LCS on what is left.
 */
export function lineDiff(a: readonly string[], b: readonly string[], limit = 40): LineDiff {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const x = a.slice(start, endA)
  const y = b.slice(start, endB)
  const out: string[] = []
  if (x.length * y.length > LCS_CELL_LIMIT) {
    // shortcut: very large rewrites lose interleaving, fine for a "go and look" signal
    for (const l of x) out.push(`- ${l}`)
    for (const l of y) out.push(`+ ${l}`)
  } else {
    const n = x.length
    const m = y.length
    const dp = new Uint32Array((n + 1) * (m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * (m + 1) + j] =
          x[i] === y[j] ? dp[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(dp[(i + 1) * (m + 1) + j]!, dp[i * (m + 1) + j + 1]!)
      }
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) {
        i++
        j++
      } else if (j >= m || (i < n && dp[(i + 1) * (m + 1) + j]! >= dp[i * (m + 1) + j + 1]!)) {
        out.push(`- ${x[i++]}`)
      } else {
        out.push(`+ ${y[j++]}`)
      }
    }
  }
  return { lines: out.slice(0, limit), total: out.length }
}
