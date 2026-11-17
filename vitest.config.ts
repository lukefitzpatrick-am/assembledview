import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

import { findTests } from "./scripts/test-files.mjs"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vitest runs every test file that imports `vitest`. Files that import
 * `node:test` run in `scripts/run-tests.mjs` (`npm test`).
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
    // B47: every test file that imports vitest, found by name (scripts/test-files.mjs).
    include: findTests(root)
      .filter((t) => t.runner === "vitest")
      .map((t) => t.file),
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
