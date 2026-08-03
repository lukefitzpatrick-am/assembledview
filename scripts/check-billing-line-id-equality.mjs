#!/usr/bin/env node
/**
 * MB-4 / MB-11 guard: fail CI when billing line identity uses strict === / !==
 * or raw Map/Set membership (.has/.get/.set/.delete) against a lineItemId-ish
 * argument without canonicalisation.
 *
 * Use billingOverrideLineIdsMatch / toBillingOverrideLineItemId /
 * buildCanonicalBillingLineIdSet / canonicalBillingLineIdSetHas instead.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const roots = [
  "components/billing",
  "lib/billing",
  "lib/finance",
  "lib/data",
  "app/mediaplans/create",
  "app/mediaplans/mba",
]

/** Strict equality between `.id` and `lineItemId` (MB-4). */
const equalityPattern =
  /\.id\s*(===|!==)\s*(args\.)?lineItemId|(args\.)?lineItemId\s*(===|!==)\s*\w+\.id/

/**
 * Map/Set membership with a lineItemId-ish arg and no canonical helper on the line (MB-11).
 * Catches: livingLineItemIds.has(lineItemId), map.get(line.lineItemId), etc.
 */
const membershipCallPattern =
  /\.(?:has|get|set|delete)\(\s*(?:(?:args\.)?lineItemId|line\.lineItemId|l\.lineItemId|row\.lineItemId|r\.lineItemId)\b/

const canonHelperPattern =
  /toBillingOverrideLineItemId|billingOverrideLineIdsMatch|buildCanonicalBillingLineIdSet|canonicalBillingLineIdSetHas/

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

function isMembershipViolation(line) {
  if (!membershipCallPattern.test(line)) return false
  // Allowed when the same line canonicalises before membership.
  if (canonHelperPattern.test(line)) return false
  return true
}

const hits = []
for (const rel of roots) {
  for (const file of walk(path.join(rootDir, rel))) {
    const text = fs.readFileSync(file, "utf8")
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
      const eq = equalityPattern.test(line)
      const mem = isMembershipViolation(line)
      if (eq || mem) {
        const kind = eq && mem ? "eq+membership" : eq ? "equality" : "membership"
        hits.push(
          `${path.relative(rootDir, file)}:${i + 1}:[${kind}] ${line.trim()}`
        )
      }
    })
  }
}

if (hits.length) {
  console.error(
    "Strict billing line id equality / raw Map·Set membership is banned (MB-4 / MB-11).\n" +
      "Use billingOverrideLineIdsMatch / toBillingOverrideLineItemId /\n" +
      "buildCanonicalBillingLineIdSet / canonicalBillingLineIdSetHas.\n\n" +
      hits.join("\n")
  )
  process.exit(1)
}

console.log(
  "OK: no strict billing line id === / !== or raw Map·Set membership on lineItemId (MB-4 / MB-11)."
)
