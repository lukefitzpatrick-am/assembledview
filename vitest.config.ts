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
      "tests/format/money-date.test.ts",
      "tests/learning/evaluator.test.ts",
      "tests/learning/solver-roundtrip.test.ts",
      "lib/dashboard/__tests__/budgetSpendTiles.test.ts",
      "lib/dashboard/__tests__/homeDashboardFilters.test.ts",
      "lib/dashboard/__tests__/mediaMixFromDeliverySchedule.test.ts",
      "lib/dashboard/__tests__/plannedSpendConsistency.test.ts",
      "lib/dashboard/__tests__/spendInsightsCaptions.test.ts",
      "lib/api/dashboard/__tests__/client.test.ts",
      "lib/pacing/__tests__/statusUi.test.ts",
      "components/pacing/__tests__/PacingStatusSummary.test.tsx",
      "components/tasks/__tests__/TaskMbaSelect.render.test.tsx",
      "components/tasks/__tests__/TaskChecklist.render.test.tsx",
      "components/dashboard/__tests__/SpendingInsightsSection.render.test.tsx",
      "components/dashboard/delivery/__tests__/ChannelSection.render.test.tsx",
      "components/ava/__tests__/ChatMarkdown.render.test.tsx",
      "components/auth/__tests__/SessionExpiredBanner.render.test.tsx",
      "hooks/__tests__/usePlanDraftSession.test.tsx",
      "hooks/__tests__/useDraftFieldDiff.test.tsx",
      "hooks/__tests__/useStableHydration.test.tsx",
      "components/mediaplans/__tests__/ExpertApplyDirtyClearOnSave.characterisation.test.tsx",
      "components/mediaplans/__tests__/PlanWizardSaveMessages.test.tsx",
      "lib/mediaplan/__tests__/useMediaPlanDirtyController.test.tsx",
      "lib/mediaplan/__tests__/handleInvestmentChange.dirty.characterisation.test.tsx",
      "lib/mediaplan/__tests__/channelTotalChange.dirty.characterisation.test.tsx",
      "lib/mediaplan/__tests__/oohStandardContainer.bench.test.tsx",
      "components/dashboard/delivery/__tests__/shouldShowChannelAggregate.test.ts",
      "components/dashboard/delivery/__tests__/entityBreakdown.test.tsx",
      "components/dashboard/delivery/channels/__tests__/directDigitalChart.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "lib/ava/**",
      // node:test runner suites — run via `tsx --test` / npm test:* scripts, not vitest
      "lib/finance/__tests__/panelIndicatorsFromCampaignFinancials.test.ts",
      "lib/mediaplan/__tests__/channelHydrationGate.test.ts",
      "lib/billing/__tests__/billingScheduleUtils.node-test.ts",
      "lib/finance/__tests__/computeCampaignFinancials.feeBase.test.ts",
      "lib/finance/__tests__/computeCampaignFinancials.smoke.test.ts",
      "lib/naming/__tests__/resolveNamingReferenceData.test.ts",
    ],
    coverage: {
      provider: "v8",
      // Never threshold-gate — readings only (`npm run test:coverage`).
      reportOnFailure: true,
      include: [
        "lib/mediaplan/mediaPlanDirtyController.ts",
        "lib/mediaplan/useMediaPlanDirtyController.ts",
        "components/mediaplans/ExpertApplyDirtyClearOnSave.tsx",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage/dirty",
    },
  },
})
