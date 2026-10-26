import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { getTableConfig } from "drizzle-orm/pg-core"

import { billingRevisions } from "@/db/schema/billingRevisions"

import { isBillingRevisionsEnabled, isBillingRevisionsUiEnabled } from "../flag"
import {
  BillingRevisionsNotReadyError,
  assertBillingRevisionsReady,
  isBillingRevisionsMigrationApplied,
} from "../marker"

function withEnv(key: string, value: string | undefined, fn: () => void) {
  const prev = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env[key]
    else process.env[key] = prev
  }
}

test("BILLING_REVISIONS defaults off", () => {
  withEnv("BILLING_REVISIONS", undefined, () => assert.equal(isBillingRevisionsEnabled(), false))
  withEnv("BILLING_REVISIONS", "off", () => assert.equal(isBillingRevisionsEnabled(), false))
  withEnv("BILLING_REVISIONS", "on", () => assert.equal(isBillingRevisionsEnabled(), true))
  withEnv("NEXT_PUBLIC_BILLING_REVISIONS", undefined, () => assert.equal(isBillingRevisionsUiEnabled(), false))
  withEnv("NEXT_PUBLIC_BILLING_REVISIONS", "on", () => assert.equal(isBillingRevisionsUiEnabled(), true))
})

test("marker gate: missing marker or a failed read means not ready", async () => {
  assert.equal(await isBillingRevisionsMigrationApplied(async () => true), true)
  assert.equal(await isBillingRevisionsMigrationApplied(async () => false), false)
  assert.equal(
    await isBillingRevisionsMigrationApplied(async () => {
      throw new Error("relation does not exist")
    }),
    false,
  )
  await assert.rejects(assertBillingRevisionsReady(async () => false), BillingRevisionsNotReadyError)
  await assertBillingRevisionsReady(async (key) => key === "0106_billing_revisions")
})

test("0106 SQL, the Supabase run file and the Drizzle mirror have the same columns", () => {
  const root = process.cwd()
  const cols = (file: string) => {
    const sqlText = readFileSync(join(root, file), "utf8")
    const body = sqlText.slice(sqlText.indexOf("public.billing_revisions ("), sqlText.indexOf("CONSTRAINT billing_revisions_mode_check"))
    return [...body.matchAll(/^\s{4}([a-z_]+)\s+(bigint|integer|text|jsonb|timestamptz)/gm)].map((m) => m[1]).sort()
  }
  const mirror = getTableConfig(billingRevisions).columns.map((c) => c.name).sort()
  assert.deepEqual(cols("db/migrations/0106_billing_revisions.sql"), mirror)
  assert.deepEqual(cols("sql/supabase/2026-10-26_0106_billing_revisions_SUPABASE.sql"), mirror)
  assert.equal(mirror.length, 19)
})
