/**
 * Test database guard.
 *
 * DB-backed tests must never touch production. `.env.local` holds the
 * production Supabase URLs, and tests that loaded it wrote junk rows to
 * production (10 to 19 Oct 2026). This module decides whether a database URL
 * is safe for a test run.
 *
 * Allowed:
 * - `TEST_DATABASE_URL` (and optional `TEST_DIRECT_URL`) set explicitly, for a
 *   local or Supabase branch database, as long as it does not reference the
 *   production project.
 * - A `DATABASE_URL` / `DIRECT_URL` on localhost.
 *
 * Anything else is refused: the variable is blanked to " " (so later
 * `.env.local` loads cannot refill it and `hasDb` checks skip) and one
 * warning names the host. Credentials are never printed.
 *
 * Pure module: no imports, safe to load from `db/index.ts`.
 */

/** Production Supabase project ref (AssembledView). */
export const PRODUCTION_SUPABASE_REF = "slpdibnxtpdlttbbczvg"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"])

/** Value a refused variable is set to. Blank after trim, but truthy, so `.env.local` loaders do not refill it. */
export const REFUSED_DATABASE_URL = " "

export type TestDatabaseUrlVerdict =
  | { ok: true; host: string }
  | { ok: false; host: string | null; reason: string }

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/**
 * Classify one URL. `explicit` is true only for `TEST_DATABASE_URL` /
 * `TEST_DIRECT_URL`, which may point at a remote (branch) database.
 */
export function classifyTestDatabaseUrl(
  url: string,
  opts: { explicit?: boolean } = {},
): TestDatabaseUrlVerdict {
  const trimmed = url.trim()
  const host = hostOf(trimmed)
  if (!host) return { ok: false, host: null, reason: "not a parseable database URL" }
  if (trimmed.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) {
    return { ok: false, host, reason: `production Supabase project ${PRODUCTION_SUPABASE_REF}` }
  }
  if (LOCAL_HOSTS.has(host.toLowerCase())) return { ok: true, host }
  if (opts.explicit) return { ok: true, host }
  return {
    ok: false,
    host,
    reason: "not localhost and not set through TEST_DATABASE_URL",
  }
}

/** True when this process is running tests (node:test, tsx --test or vitest). */
export function isTestRuntime(): boolean {
  if (process.env.NODE_TEST_CONTEXT) return true
  if (process.env.VITEST) return true
  if (process.env.NODE_ENV === "test") return true
  return process.execArgv.some((a) => a === "--test" || a.startsWith("--test-"))
}

let warned = false

function warnOnce(key: string, verdict: Extract<TestDatabaseUrlVerdict, { ok: false }>): void {
  if (warned) return
  warned = true
  console.warn(
    `[test-db-guard] ${key} refused (${verdict.reason}${verdict.host ? `, host ${verdict.host}` : ""}). ` +
      "DB-backed tests will skip. To run them, set TEST_DATABASE_URL to a localhost or Supabase branch database.",
  )
}

export type TestDatabaseGuardResult = {
  /** True when DATABASE_URL is now a usable non-production URL. */
  hasDb: boolean
  /** Why the DB is not available, when hasDb is false. */
  reason: string | null
}

/**
 * Apply the guard to `process.env`. Call after any `.env.local` load.
 * Idempotent.
 */
export function applyTestDatabaseGuard(): TestDatabaseGuardResult {
  const env = process.env
  const testUrl = env.TEST_DATABASE_URL?.trim()

  if (testUrl) {
    const verdict = classifyTestDatabaseUrl(testUrl, { explicit: true })
    if (!verdict.ok) {
      warnOnce("TEST_DATABASE_URL", verdict)
      env.DATABASE_URL = REFUSED_DATABASE_URL
      env.DIRECT_URL = REFUSED_DATABASE_URL
      return { hasDb: false, reason: verdict.reason }
    }
    env.DATABASE_URL = testUrl
    const testDirect = env.TEST_DIRECT_URL?.trim()
    if (testDirect && classifyTestDatabaseUrl(testDirect, { explicit: true }).ok) {
      env.DIRECT_URL = testDirect
    } else {
      env.DIRECT_URL = testUrl
    }
    return { hasDb: true, reason: null }
  }

  let reason: string | null = null
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = env[key]?.trim()
    if (!value) continue
    const verdict = classifyTestDatabaseUrl(value)
    if (!verdict.ok) {
      warnOnce(key, verdict)
      env[key] = REFUSED_DATABASE_URL
      if (key === "DATABASE_URL") reason = verdict.reason
    }
  }
  const hasDb = Boolean(env.DATABASE_URL?.trim())
  return { hasDb, reason: hasDb ? null : (reason ?? "DATABASE_URL unset") }
}

/**
 * Direct (non-pooler) URL for tests that open their own postgres client.
 * Applies the guard first; returns null when no safe URL exists.
 */
export function safeTestDirectUrl(): string | null {
  applyTestDatabaseGuard()
  return process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || null
}

/**
 * Hard stop for `db/index.ts`: throws when a test run is about to open a
 * client on a refused URL. No-op outside tests.
 */
export function assertDatabaseUrlAllowedInTests(url: string): void {
  if (!isTestRuntime()) return
  const explicit =
    url.trim() !== "" &&
    (url.trim() === process.env.TEST_DATABASE_URL?.trim() ||
      url.trim() === process.env.TEST_DIRECT_URL?.trim())
  const verdict = classifyTestDatabaseUrl(url, { explicit })
  if (!verdict.ok) {
    throw new Error(
      `[test-db-guard] Refusing to open a database client in a test run (${verdict.reason}). ` +
        "Set TEST_DATABASE_URL to a localhost or Supabase branch database.",
    )
  }
}
