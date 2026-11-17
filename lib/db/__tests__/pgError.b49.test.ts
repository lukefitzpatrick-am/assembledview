/**
 * B49: one Postgres error reader. The copies it replaced are kept verbatim
 * below and every shape they handled gives the same answer.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { isLockConflict, isMissingColumn, isMissingRelation, isUniqueViolation, safeErrorMessage, sqlStateOf, DATABASE_ERROR_MESSAGE } from "../pgError"

// --- old copies (before B49) -------------------------------------------------
type E = { code?: string; cause?: E; message?: string; constraint_name?: string }
function oldMediaplansUnique(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as E
  return e.code === "23505" || e.cause?.code === "23505" || /unique|duplicate key/i.test(String(e.message ?? ""))
}
function oldWriteKpiUnique(err: unknown): boolean {
  const e = err as E
  return e?.code === "23505" || e?.cause?.code === "23505"
}
function oldChain(err: unknown): unknown[] {
  const out: unknown[] = []
  let cur: unknown = err
  for (let i = 0; cur != null && i < 5; i += 1) {
    out.push(cur)
    cur = (cur as { cause?: unknown }).cause
  }
  return out
}
function oldProjectsUnique(err: unknown, constraint: string): boolean {
  return oldChain(err).some((e) => {
    const rec = e as E & { constraint?: string }
    if (rec?.code !== "23505") return false
    return String(rec.constraint_name ?? rec.constraint ?? rec.message ?? "").includes(constraint)
  })
}
function oldMissingSchema(err: unknown): boolean {
  return oldChain(err).some((e) => ["42P01", "42703"].includes(String((e as E)?.code)))
}
function oldDeadlineMissing(err: unknown): boolean {
  return (err as E | null)?.code === "42P01"
}
function oldSection55P03(err: unknown): boolean {
  const e = err as E
  return e?.code === "55P03" || e?.cause?.code === "55P03"
}

const drizzle = (code: string, extra: Partial<E> = {}) =>
  Object.assign(new Error(`Failed query: insert into x values ($1)\nparams: 1`), { name: "DrizzleQueryError", cause: Object.assign(new Error("pg says no"), { code, ...extra }) })
const bare = (code: string, extra: Partial<E> = {}) => Object.assign(new Error("pg says no"), { code, ...extra })

const CODES = ["23505", "23503", "23502", "42703", "42P01", "40P01", "55P03", "57014", "42501"]
const SHAPES: Array<[string, unknown]> = [
  ...CODES.flatMap((c) => [[`bare ${c}`, bare(c)], [`drizzle ${c}`, drizzle(c)]] as Array<[string, unknown]>),
  ["duplicate key text, no code", new Error('duplicate key value violates unique constraint "uq_x"')],
  ["plain error", new Error("boom")],
  ["null", null],
  ["string", "23505"],
]

test("unique violation: every code the copies handled gives the same answer", () => {
  for (const [name, err] of SHAPES) {
    assert.equal(isUniqueViolation(err), oldWriteKpiUnique(err) || oldMediaplansUnique(err), name)
  }
  const named = drizzle("23505", { constraint_name: "uq_codex_projects_mba" })
  assert.equal(isUniqueViolation(named, "uq_codex_projects_mba"), oldProjectsUnique(named, "uq_codex_projects_mba"))
  assert.equal(isUniqueViolation(named, "uq_other"), oldProjectsUnique(named, "uq_other"))
  assert.equal(isUniqueViolation(drizzle("23503", { constraint_name: "uq_codex_projects_mba" }), "uq_codex_projects_mba"), false)
})

test("missing table and column, lock and timeout codes match the copies", () => {
  for (const [name, err] of SHAPES) {
    assert.equal(isMissingRelation(err) || isMissingColumn(err), oldMissingSchema(err), `schema ${name}`)
    if (name.startsWith("bare") || name === "null") assert.equal(isMissingRelation(err), oldDeadlineMissing(err), `relation ${name}`)
    assert.equal(sqlStateOf(err) === "55P03", oldSection55P03(err), `55P03 ${name}`)
  }
  assert.equal(isLockConflict(drizzle("40P01")), true)
  assert.equal(isLockConflict(bare("55P03")), true)
  assert.equal(isLockConflict(drizzle("57014")), false)
  assert.equal(sqlStateOf(drizzle("57014")), "57014")
  assert.equal(sqlStateOf(new Error("no code")), null)
})

test("a database error's text never reaches the client", () => {
  assert.equal(safeErrorMessage(drizzle("23505")), DATABASE_ERROR_MESSAGE)
  assert.equal(safeErrorMessage(new Error("Failed query: select secret")), DATABASE_ERROR_MESSAGE)
  assert.equal(safeErrorMessage(new Error("Invalid recurring_rule")), "Invalid recurring_rule")
})
