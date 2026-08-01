/**
 * Shared async semaphore for line-item write POSTs.
 * Cap is process-wide so concurrent channel saves share one in-flight budget.
 */
export const LINE_ITEM_WRITE_CONCURRENCY = 4

export type Semaphore = {
  run: <T>(fn: () => Promise<T>) => Promise<T>
}

export function createSemaphore(concurrency: number): Semaphore {
  let available = Math.max(1, Math.floor(concurrency) || 1)
  const waiters: Array<() => void> = []

  async function acquire(): Promise<void> {
    if (available > 0) {
      available--
      return
    }
    await new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  }

  function release(): void {
    const next = waiters.shift()
    if (next) {
      // Hand the permit directly to the next waiter (available stays 0).
      next()
    } else {
      available++
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }

  return { run }
}

/** Shared across all save*LineItems so total in-flight POSTs ≤ 4. */
export const lineItemWriteSemaphore = createSemaphore(LINE_ITEM_WRITE_CONCURRENCY)
