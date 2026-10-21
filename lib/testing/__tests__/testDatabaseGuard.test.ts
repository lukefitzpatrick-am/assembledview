import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import {
  PRODUCTION_SUPABASE_REF,
  REFUSED_DATABASE_URL,
  applyTestDatabaseGuard,
  assertDatabaseUrlAllowedInTests,
  classifyTestDatabaseUrl,
} from "../testDatabaseGuard"

const PROD_POOLER = `postgresql://postgres.${PRODUCTION_SUPABASE_REF}:pw@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`
const PROD_DIRECT = `postgresql://postgres:pw@db.${PRODUCTION_SUPABASE_REF}.supabase.co:5432/postgres`
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const BRANCH = "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres"

const KEYS = ["DATABASE_URL", "DIRECT_URL", "TEST_DATABASE_URL", "TEST_DIRECT_URL"] as const
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("classifyTestDatabaseUrl", () => {
  it("refuses both production URL shapes, even when explicit", () => {
    assert.equal(classifyTestDatabaseUrl(PROD_POOLER).ok, false)
    assert.equal(classifyTestDatabaseUrl(PROD_DIRECT).ok, false)
    assert.equal(classifyTestDatabaseUrl(PROD_POOLER, { explicit: true }).ok, false)
  })
  it("allows localhost, and a remote branch only when explicit", () => {
    assert.equal(classifyTestDatabaseUrl(LOCAL).ok, true)
    assert.equal(classifyTestDatabaseUrl(BRANCH).ok, false)
    assert.equal(classifyTestDatabaseUrl(BRANCH, { explicit: true }).ok, true)
  })
  it("never puts credentials in the reason", () => {
    const v = classifyTestDatabaseUrl(PROD_POOLER)
    assert.equal(v.ok, false)
    if (!v.ok) assert.ok(!v.reason.includes("pw"))
  })
})

describe("applyTestDatabaseGuard", () => {
  it("blanks production DATABASE_URL and DIRECT_URL so DB tests skip", () => {
    process.env.DATABASE_URL = PROD_POOLER
    process.env.DIRECT_URL = PROD_DIRECT
    const r = applyTestDatabaseGuard()
    assert.equal(r.hasDb, false)
    assert.equal(process.env.DATABASE_URL, REFUSED_DATABASE_URL)
    assert.equal(process.env.DIRECT_URL, REFUSED_DATABASE_URL)
    assert.equal(Boolean(process.env.DATABASE_URL?.trim()), false)
  })
  it("keeps a localhost DATABASE_URL", () => {
    process.env.DATABASE_URL = LOCAL
    assert.equal(applyTestDatabaseGuard().hasDb, true)
    assert.equal(process.env.DATABASE_URL, LOCAL)
  })
  it("TEST_DATABASE_URL wins over a production DATABASE_URL", () => {
    process.env.DATABASE_URL = PROD_POOLER
    process.env.DIRECT_URL = PROD_DIRECT
    process.env.TEST_DATABASE_URL = BRANCH
    assert.equal(applyTestDatabaseGuard().hasDb, true)
    assert.equal(process.env.DATABASE_URL, BRANCH)
    assert.equal(process.env.DIRECT_URL, BRANCH)
  })
  it("refuses a TEST_DATABASE_URL that points at production", () => {
    process.env.TEST_DATABASE_URL = PROD_DIRECT
    assert.equal(applyTestDatabaseGuard().hasDb, false)
    assert.equal(process.env.DATABASE_URL, REFUSED_DATABASE_URL)
  })
})

describe("assertDatabaseUrlAllowedInTests", () => {
  it("throws for production inside a test run", () => {
    assert.throws(() => assertDatabaseUrlAllowedInTests(PROD_POOLER), /test-db-guard/)
  })
  it("allows localhost and an explicit TEST_DATABASE_URL", () => {
    assertDatabaseUrlAllowedInTests(LOCAL)
    process.env.TEST_DATABASE_URL = BRANCH
    assertDatabaseUrlAllowedInTests(BRANCH)
  })
})
