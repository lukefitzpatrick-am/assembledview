/**
 * Static AuthZ regression: every app/api route.ts that exports
 * GET/POST/PATCH/PUT/DELETE must contain a recognised guard in the file
 * (or an explicit allowlist entry). New unguarded routes fail CI.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  HARNESS_GUARD_NAMES,
  detectExportedMethods,
  detectGuards,
  listRouteFiles,
} from "../tenantRouteInventory.js"

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const appApiRoot = path.join(repoRoot, "app", "api")

/**
 * Explicit exemptions — each entry is a visible decision.
 * Prefer fixing the route over adding here. Known defects marked KNOWN DEFECT
 * so they stay visible until closed (do not copy for new routes).
 */
export const API_ROUTE_GUARD_ALLOWLIST: {
  /** Path relative to repo root, posix. */
  file: string
  reason: string
}[] = [
  // --- public ---
  {
    file: "app/api/creative-assets/[id]/frame/route.ts",
    reason: "public: signed frame URL via verifyFrameToken (no Auth0 session)",
  },

  // --- session-ref (middleware session only; not tenant MBA rows) ---
  {
    file: "app/api/me/route.ts",
    reason: "session-ref: returns caller identity/roles only",
  },
  {
    file: "app/api/publishers/check-id/route.ts",
    reason: "session-ref: publisher id uniqueness probe for admin create forms",
  },

  // --- admin-only by path, session-only AuthZ (should be requireFinanceAdmin) ---
  {
    file: "app/api/finance/forecast/snapshots/route.ts",
    reason:
      "KNOWN DEFECT soft: /api/finance/* book-wide; auth0.getSession only — pending requireFinanceAdmin",
  },
  {
    file: "app/api/finance/forecast/snapshots/[id]/lines/route.ts",
    reason:
      "KNOWN DEFECT soft: /api/finance/* book-wide; auth0.getSession only — pending requireFinanceAdmin",
  },
  {
    file: "app/api/finance/forecast/snapshots/variance/route.ts",
    reason:
      "KNOWN DEFECT soft: /api/finance/* book-wide; auth0.getSession only — pending requireFinanceAdmin",
  },
  {
    file: "app/api/finance/forecast/targets/route.ts",
    reason:
      "KNOWN DEFECT soft: /api/finance/* book-wide; auth0.getSession only — pending requireFinanceAdmin",
  },
  {
    file: "app/api/finance/forecast/variance/target-vs-actual/route.ts",
    reason:
      "KNOWN DEFECT soft: /api/finance/* book-wide; auth0.getSession only — pending requireFinanceAdmin",
  },
]

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

function fileHasRecognisedGuard(source: string): boolean {
  const { names } = detectGuards(source)
  return names.some((n) => HARNESS_GUARD_NAMES.has(n))
}

test("every app/api route handler file has a recognised AuthZ guard or allowlist entry", () => {
  const allow = new Map(
    API_ROUTE_GUARD_ALLOWLIST.map((e) => [e.file.replace(/\\/g, "/"), e.reason])
  )
  const files = listRouteFiles(appApiRoot)
  const failures: string[] = []
  const usedAllow = new Set<string>()

  for (const abs of files) {
    const rel = toPosix(path.relative(repoRoot, abs))
    const source = fs.readFileSync(abs, "utf8")
    const methods = detectExportedMethods(source)
    if (methods.length === 0) continue

    if (fileHasRecognisedGuard(source)) {
      continue
    }

    const reason = allow.get(rel)
    if (reason) {
      usedAllow.add(rel)
      continue
    }

    failures.push(
      `${rel} exports [${methods.join(", ")}] with no recognised guard ` +
        `(checkClientMbaAccess|requireRole|requireAdmin|requireFinanceAdmin|` +
        `requireCodexInternalAccess|requireProxyStaff|requirePacingAccess|` +
        `resolveClientMbaScope|assertCronSecret|createChannelLineItemsGetHandler|` +
        `getUserClientSlugs|getUserClientIdentifier|inline admin/client deny). ` +
        `Add a gate or an explicit allowlist entry in tenantRouteGuard.harness.test.ts.`
    )
  }

  // Stale allowlist entries must be removed when a real gate is added.
  for (const [file, reason] of allow) {
    if (usedAllow.has(file)) continue
    const abs = path.join(repoRoot, file)
    if (!fs.existsSync(abs)) {
      failures.push(`allowlist entry missing on disk: ${file} (${reason})`)
      continue
    }
    const source = fs.readFileSync(abs, "utf8")
    if (fileHasRecognisedGuard(source)) {
      failures.push(
        `allowlist entry obsolete (file now has a recognised guard): ${file}`
      )
    } else if (detectExportedMethods(source).length === 0) {
      failures.push(`allowlist entry has no exported handlers: ${file}`)
    } else {
      // Unused because… shouldn't happen if we only skip when guard present.
      // If file has no guard and is on allowlist, usedAllow should have it.
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"))
})

test("allowlist entries are unique and have reasons", () => {
  const seen = new Set<string>()
  for (const e of API_ROUTE_GUARD_ALLOWLIST) {
    assert.ok(e.reason.trim().length > 8, `reason too short for ${e.file}`)
    assert.ok(!seen.has(e.file), `duplicate allowlist file ${e.file}`)
    seen.add(e.file)
  }
})
