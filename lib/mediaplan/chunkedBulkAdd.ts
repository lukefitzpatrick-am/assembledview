/**
 * Chunked bulk-add helpers for expert grids.
 *
 * Large "Add N rows" must not build + push hundreds of empty rows in one long
 * main-thread task. Chunks yield between RAF frames with optional progress.
 */

export const EXPERT_BULK_ADD_CHUNK_SIZE = 25
/** Above this N, insert across frames; below stays a single synchronous push. */
export const EXPERT_BULK_ADD_CHUNK_THRESHOLD = 40

export function clampBulkAddCount(raw: string | number, max = 500): number {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw || "1"), 10)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(max, n))
}

export function bulkAddChunkPlan(
  totalToAdd: number,
  chunkSize: number = EXPERT_BULK_ADD_CHUNK_SIZE,
  threshold: number = EXPERT_BULK_ADD_CHUNK_THRESHOLD
): { chunkSize: number; chunkCount: number; useChunking: boolean } {
  const useChunking = totalToAdd >= threshold
  const size = useChunking ? Math.max(1, chunkSize) : totalToAdd
  const chunkCount = Math.ceil(totalToAdd / size)
  return { chunkSize: size, chunkCount, useChunking }
}

export function defaultYieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

/**
 * Append `totalToAdd` rows created by `createRows(offset, count)`, pushing
 * after each chunk so React can paint a progress hint between frames.
 */
export async function appendRowsInChunks<T>(args: {
  existing: readonly T[]
  totalToAdd: number
  createRows: (offset: number, count: number) => T[]
  pushRows: (rows: T[]) => void
  onProgress?: (done: number, total: number) => void
  chunkSize?: number
  threshold?: number
  yieldFrame?: () => Promise<void>
}): Promise<T[]> {
  const {
    existing,
    totalToAdd,
    createRows,
    pushRows,
    onProgress,
    chunkSize = EXPERT_BULK_ADD_CHUNK_SIZE,
    threshold = EXPERT_BULK_ADD_CHUNK_THRESHOLD,
    yieldFrame = defaultYieldToNextFrame,
  } = args

  const plan = bulkAddChunkPlan(totalToAdd, chunkSize, threshold)
  let rows = existing.slice() as T[]
  let done = 0

  if (!plan.useChunking) {
    const added = createRows(0, totalToAdd)
    rows = rows.concat(added)
    pushRows(rows)
    onProgress?.(totalToAdd, totalToAdd)
    return rows
  }

  for (let offset = 0; offset < totalToAdd; offset += plan.chunkSize) {
    const count = Math.min(plan.chunkSize, totalToAdd - offset)
    const added = createRows(offset, count)
    rows = rows.concat(added)
    done += count
    pushRows(rows)
    onProgress?.(done, totalToAdd)
    if (done < totalToAdd) {
      await yieldFrame()
    }
  }
  return rows
}
