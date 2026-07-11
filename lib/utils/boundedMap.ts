/**
 * Map over `items` with at most `concurrency` in-flight async workers.
 * Results preserve input order. The first rejection rejects the whole call
 * (same semantics as awaiting a sequential loop that throws).
 */
export async function boundedMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const n = items.length
  if (n === 0) return []

  const limit = Math.max(1, Math.floor(concurrency) || 1)
  const results = new Array<R>(n)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= n) return
      results[i] = await fn(items[i]!, i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, n) }, () => worker())
  await Promise.all(workers)
  return results
}
