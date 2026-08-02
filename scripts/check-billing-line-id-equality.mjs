#!/usr/bin/env node
/**
 * MB-4 guard: fail CI when strict === / !== is used between a billing line
 * `.id` and `lineItemId` (or args.lineItemId) in billing/finance surfaces.
 * Use billingOverrideLineIdsMatch instead (C-34 / BUX-1 / BUX-2 / BUX-6 / MB-4).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const roots = [
  "components/billing",
  "lib/billing",
  "lib/finance",
  "app/mediaplans/create",
  "app/mediaplans/mba",
]

const pattern =
  /\.id\s*(===|!==)\s*(args\.)?lineItemId|(args\.)?lineItemId\s*(===|!==)\s*\w+\.id/

const skipDirNames = new Set([
  "node_modules",
  ".git",
  "__tests__",
  "dist",
  ".next",
])

function shouldSkipFile(filePath) {
  const base = path.basename(filePath)
  if (base.endsWith(".test.ts") || base.endsWith(".test.tsx")) return true
  if (base === "check-billing-line-id-equality.mjs") return true
  // Finance hub BillingLineItem.id is a numeric PK, not schedule line identity.
  if (base === "useFinanceStore.ts") return true
  return false
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue
      walk(full, out)
      continue
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue
    if (shouldSkipFile(full)) continue
    out.push(full)
  }
  return out
}

const hits = []
for (const rel of roots) {
  for (const file of walk(path.join(rootDir, rel))) {
    const text = fs.readFileSync(file, "utf8")
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        hits.push(`${path.relative(rootDir, file)}:${i + 1}:${line.trim()}`)
      }
    })
  }
}

if (hits.length) {
  console.error(
    "Strict equality between billing line `.id` and `lineItemId` is banned (MB-4).\n" +
      "Use billingOverrideLineIdsMatch from lib/finance/manualBillingOverridesUi.ts.\n\n" +
      hits.join("\n")
  )
  process.exit(1)
}

console.log(
  "OK: no strict billing line id === / !== lineItemId (use billingOverrideLineIdsMatch)."
)
