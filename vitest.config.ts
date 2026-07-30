import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vitest only runs suites listed under `test.include` below.
 * Other node:test suites under __tests__ folders may still run via
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
      "lib/billing/__tests__/clientPaysMediaFilter.test.ts",
      "lib/billing/__tests__/billingScheduleUtils.test.ts",
      "lib/finance/__tests__/panelIndicatorsFromCampaignFinancials.test.ts",
      "lib/mediaplan/__tests__/channelHydrationGate.test.ts",
      "lib/mediaplan/__tests__/lineItemIdentity.test.ts",
      "lib/mediaplan/__tests__/mergeSavedChannelLineItems.test.ts",
      "lib/mediaplan/__tests__/savedPlanChannelHydration.test.ts",
      "tests/format/money-date.test.ts",
      "tests/learning/evaluator.test.ts",
      "lib/dashboard/__tests__/budgetSpendTiles.test.ts",
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
      "lib/naming/__tests__/resolveNamingReferenceData.test.ts",
    ],
  },
})
