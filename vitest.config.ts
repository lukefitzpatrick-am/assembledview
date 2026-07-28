import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vitest only runs suites listed under `test.include` below.
 * Other suites under __tests__ dirs may still use `node:test` via
 * `npx tsx --test <path>` — they are intentionally excluded here.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  // Vitest 4 defaults to oxc for transforms; enable automatic JSX runtime
  // so .tsx tests do not need a React import for JSX alone.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    include: [
      "lib/billing/__tests__/integrityTripwire.test.ts",
      "lib/mediaplan/__tests__/channelDuplicateStats.test.ts",
      "lib/mediaplan/__tests__/draftSaveReplaceInvariants.test.ts",
      "lib/mediaplan/__tests__/lineUid.test.ts",
      "lib/mediaplan/__tests__/replaceSet.test.ts",
      "lib/finance/rows/__tests__/buildRows.test.ts",
      "lib/finance/rows/__tests__/backfillCompare.test.ts",
      "lib/finance/rows/__tests__/dualWrite.test.ts",
      "lib/finance/rows/__tests__/readRowsSurfaces.test.ts",
      "lib/finance/rows/__tests__/checksumAudit.test.ts",
      "lib/finance/__tests__/billingBalancer.test.ts",
      "components/billing/__tests__/LineTimingInlineEditor.balancer.test.tsx",
      "app/api/mba/generate/route.auth.test.ts",
      "app/api/mediaplans/generate-pdf/route.auth.test.ts",
      "app/api/mediaplans/[id]/download/route.auth.test.ts",
      "app/api/mediaplans/versions/[id]/documents/route.auth.test.ts",
      "app/api/scopes-of-work/generate-pdf/route.auth.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "lib/ava/**",
      "lib/billing/__tests__/billingScheduleUtils.node-test.ts",
      "lib/finance/__tests__/computeCampaignFinancials.feeBase.test.ts",
      "lib/finance/__tests__/computeCampaignFinancials.smoke.test.ts",
      "lib/finance/__tests__/panelIndicatorsFromCampaignFinancials.test.ts",
      "lib/naming/__tests__/resolveNamingReferenceData.test.ts",
      // node:test suites — run via `npx tsx --test`, not vitest
      "lib/mediaplan/__tests__/channelHydrationGate.test.ts",
    ],
  },
})
