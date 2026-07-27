/**
 * Staggers LazyMountWhenVisible mounts so several near-viewport channel
 * containers do not all commit ExpertCard trees in the same frame.
 * One mount callback per animation frame.
 */
const queue: Array<() => void> = []
let flushing = false

export function enqueueVisibleMount(run: () => void): void {
  queue.push(run)
  if (flushing) return
  flushing = true

  const flush = () => {
    const next = queue.shift()
    if (next) {
      next()
    }
    if (queue.length > 0) {
      requestAnimationFrame(flush)
    } else {
      flushing = false
    }
  }

  if (typeof requestAnimationFrame === "undefined") {
    // SSR / test without rAF: drain synchronously but still sequentially.
    while (queue.length > 0) {
      queue.shift()?.()
    }
    flushing = false
    return
  }

  requestAnimationFrame(flush)
}

/** Test-only: clear pending mounts between cases. */
export function resetVisibleMountQueueForTests(): void {
  queue.length = 0
  flushing = false
}
