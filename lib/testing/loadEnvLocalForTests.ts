/**
 * Test-only replacement for `loadEnvLocal()`: loads `.env.local`, then applies
 * the test database guard so production URLs are refused and DB-backed tests
 * skip. See `testDatabaseGuard.ts`.
 */
import { loadEnvLocal } from "../../scripts/migration/_shared.js"
import { applyTestDatabaseGuard, type TestDatabaseGuardResult } from "./testDatabaseGuard"

export function loadEnvLocalForTests(): TestDatabaseGuardResult {
  // Guard first so an explicit TEST_DATABASE_URL wins over .env.local.
  applyTestDatabaseGuard()
  loadEnvLocal()
  return applyTestDatabaseGuard()
}
