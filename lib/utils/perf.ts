/**
 * Performance monitoring utility for server-side operations
 *
 * Usage:
 *   const perfStart = performance.now()
 *   const data = await fetchData()
 *   logPerf('Data fetch', perfStart, { rows: data.length })
 *
 * Output:
 *   [PERF] Data fetch: 1234ms { rows: 500 }
 */

const DEBUG_PERF =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_DEBUG_PERF === "true" ||
  process.env.DEBUG === "true"

/**
 * Logs performance timing for an operation
 *
 * @param operation - Name of the operation being timed
 * @param startTime - Start time from performance.now()
 * @param metadata - Optional metadata object to include in the log
 */
export function logPerf(
  operation: string,
  startTime: number,
  metadata?: Record<string, unknown>
): void {
  if (!DEBUG_PERF) return

  const durationMs = Math.round(performance.now() - startTime)
  const metaString = metadata ? ` ${JSON.stringify(metadata)}` : ""

  console.log(`[PERF] ${operation}: ${durationMs}ms${metaString}`)
}

/**
 * Creates a performance timer that can be used to log multiple checkpoints
 *
 * @param context - Context name for grouping related timings
 * @returns Timer object with checkpoint and total methods
 *
 * Usage:
 *   const timer = createPerfTimer('CampaignPage')
 *   await fetchCampaign()
 *   timer.checkpoint('Campaign fetch', { mba: '12345' })
 *   await fetchPacing()
 *   timer.checkpoint('Pacing fetch', { rows: 500 })
 *   timer.total()
 *
 * Output:
 *   [PERF] CampaignPage > Campaign fetch: 234ms { mba: '12345' }
 *   [PERF] CampaignPage > Pacing fetch: 567ms { rows: 500 }
 *   [PERF] CampaignPage > Total: 801ms
 */
export function createPerfTimer(context: string) {
  const pageStart = performance.now()
  let lastCheckpoint = pageStart

  return {
    /**
     * Log a checkpoint with time since last checkpoint
     */
    checkpoint(operation: string, metadata?: Record<string, unknown>): number {
      const now = performance.now()
      const sinceLastMs = Math.round(now - lastCheckpoint)
      lastCheckpoint = now

      if (DEBUG_PERF) {
        const metaString = metadata ? ` ${JSON.stringify(metadata)}` : ""
        console.log(`[PERF] ${context} > ${operation}: ${sinceLastMs}ms${metaString}`)
      }

      return sinceLastMs
    },

    /**
     * Log total time since timer was created
     */
    total(metadata?: Record<string, unknown>): number {
      const totalMs = Math.round(performance.now() - pageStart)

      if (DEBUG_PERF) {
        const metaString = metadata ? ` ${JSON.stringify(metadata)}` : ""
        console.log(`[PERF] ${context} > Total: ${totalMs}ms${metaString}`)
      }

      return totalMs
    },

    /**
     * Get elapsed time without logging
     */
    elapsed(): number {
      return Math.round(performance.now() - pageStart)
    },

    /**
     * Get the start time for use with logPerf
     */
    getStartTime(): number {
      return pageStart
    },
  }
}

/**
 * Wraps an async function with performance timing
 *
 * @param operation - Name of the operation
 * @param fn - Async function to wrap
 * @param getMetadata - Optional function to extract metadata from result
 * @returns The result of the wrapped function
 *
 * Usage:
 *   const data = await withPerf(
 *     'Fetch users',
 *     () => fetchUsers(),
 *     (result) => ({ count: result.length })
 *   )
 */
export async function withPerf<T>(
  operation: string,
  fn: () => Promise<T>,
  getMetadata?: (result: T) => Record<string, unknown>
): Promise<T> {
  const start = performance.now()
  const result = await fn()

  if (DEBUG_PERF) {
    const durationMs = Math.round(performance.now() - start)
    const metadata = getMetadata?.(result)
    const metaString = metadata ? ` ${JSON.stringify(metadata)}` : ""
    console.log(`[PERF] ${operation}: ${durationMs}ms${metaString}`)
  }

  return result
}

/**
 * Check if performance debugging is enabled
 */
export function isPerfDebugEnabled(): boolean {
  return DEBUG_PERF
}
