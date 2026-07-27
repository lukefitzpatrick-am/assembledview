import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vitest suites only. Most `*.test.ts` files use `node:test` via `tsx --test`
 * (package.json scripts) — leaving them in vitest's default include produces
 * ~184 phantom "No test suite found" failures that bury real regressions.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    include: [
      "lib/mediaplan/expertGridRowPerf*.test.ts",
      "lib/mediaplan/__tests__/draftSaveReplaceInvariants.test.ts",
      "lib/mediaplan/__tests__/channelDuplicateStats.test.ts",
      "lib/mediaplan/__tests__/channelHydrationGate.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.worktrees/**",
      "**/dist/**",
      "**/.next/**",
    ],
  },
})
