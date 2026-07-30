/**
 * Node-only boot warmers. Loaded only from `instrumentation.ts` after
 * `NEXT_RUNTIME === "nodejs"` so Edge instrumentation never resolves postgres.
 */

export async function warmCachesOnBoot(): Promise<void> {
  const label = "[cache-warm]"
  console.log(`${label} starting cold builds…`)

  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: "mediaPlanVersions",
      run: async () => {
        const { getCachedMediaPlanVersions } = await import(
          "@/lib/api/mediaPlanVersionsCache"
        )
        return getCachedMediaPlanVersions()
      },
    },
    {
      name: "mediaPlansList",
      run: async () => {
        const { getCachedMediaPlansList } = await import(
          "@/lib/api/mediaPlansListCache"
        )
        return getCachedMediaPlansList()
      },
    },
    {
      name: "publishers",
      run: async () => {
        const { getCachedPublishersList } = await import(
          "@/lib/api/publishersCache"
        )
        return getCachedPublishersList({ light: true })
      },
    },
    {
      name: "publisherKpis",
      run: async () => {
        const { getCachedPublisherKpis } = await import(
          "@/lib/api/publisherKpiCache"
        )
        return getCachedPublisherKpis()
      },
    },
    {
      name: "clients",
      run: async () => {
        const { getCachedClientsList } = await import(
          "@/lib/cache/clientsCache"
        )
        return getCachedClientsList()
      },
    },
    {
      name: "mediaContainerBestPractice",
      run: async () => {
        const { getCachedMediaContainerBestPractice } = await import(
          "@/lib/api/mediaContainerBestPracticeCache"
        )
        return getCachedMediaContainerBestPractice()
      },
    },
  ]

  await Promise.all(
    tasks.map(async ({ name, run }) => {
      const t0 = Date.now()
      try {
        await run()
        console.log(`${label} ${name} ready in ${Date.now() - t0}ms`)
      } catch (err) {
        console.warn(
          `${label} ${name} failed after ${Date.now() - t0}ms (non-fatal):`,
          err instanceof Error ? err.message : err,
        )
      }
    }),
  )

  console.log(`${label} done`)
}
