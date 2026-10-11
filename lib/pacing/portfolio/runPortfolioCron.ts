/**
 * The 21:30 UTC retry slot builds only when today's admin row is missing.
 * The 21:00 slot always builds (`retry` false).
 */
export async function runPortfolioCronBuild<T>(args: {
  retry: boolean
  readToday: () => Promise<T | null>
  build: () => Promise<T>
}): Promise<{ status: "already built" } | { status: "built"; snapshot: T }> {
  if (args.retry) {
    const today = await args.readToday()
    if (today != null) return { status: "already built" }
  }
  return { status: "built", snapshot: await args.build() }
}
