export const GENERATING_STALE_MS = 10 * 60 * 1000
export const GENERATING_STALE_ERROR = "Timed out"

export function isGeneratingStale(generatedAt: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(generatedAt)
  return Number.isFinite(t) && nowMs - t > GENERATING_STALE_MS
}

export function applyStaleGeneratingFailure<
  T extends { status: string; generatedAt: string; errorMessage?: string | null },
>(row: T, nowMs: number = Date.now()): T {
  if (row.status !== "generating" || !isGeneratingStale(row.generatedAt, nowMs)) {
    return row
  }
  return { ...row, status: "failed", errorMessage: GENERATING_STALE_ERROR }
}
