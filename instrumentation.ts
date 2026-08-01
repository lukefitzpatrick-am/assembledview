/**
 * Next.js register() hook — fire-and-forget cold cache builds on server start
 * so the first visitor after deploy/restart hits warm caches.
 *
 * Failures are logged and swallowed; a warm-up error must never crash boot.
 *
 * Node-only work lives in `instrumentation.node.ts` and is dynamically imported
 * only when `NEXT_RUNTIME === "nodejs"`. That keeps Edge instrumentation free of
 * the postgres → Node-builtin graph (`db/index.ts` ← `lib/data/readClients.ts`
 * ← `lib/cache/clientsCache.ts`).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // On serverless (Vercel), every lambda cold start would re-fire all warm builds
  // concurrently and starve the shared Xano Launch instance. Opt-in only.
  if (process.env.VERCEL && process.env.WARM_CACHES_ON_BOOT !== "true") {
    console.log("[cache-warm] skipped (serverless; set WARM_CACHES_ON_BOOT=true to enable)")
    return
  }

  // webpackIgnore: Edge instrumentation still statically traces ordinary dynamic
  // imports into postgres Node builtins (crypto/stream/tls/net). Native require
  // at runtime keeps that graph out of the Edge bundle.
  void import(/* webpackIgnore: true */ "./instrumentation.node")
    .then((mod: { warmCachesOnBoot: () => Promise<void> }) => mod.warmCachesOnBoot())
    .catch((err) => {
      console.warn(
        "[cache-warm] unexpected failure (non-fatal):",
        err instanceof Error ? err.message : err,
      )
    })
}
