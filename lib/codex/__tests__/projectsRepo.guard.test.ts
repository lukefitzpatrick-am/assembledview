/**
 * Codex projects store (S1, B38): the 0118 marker guard, no database.
 * Before the migration every call is ProjectsUnavailableError (routes: 503),
 * never a query on the new tables.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Db } from "@/db"
import {
  isMissingProjectsSchema,
  isProjectsMigrationApplied,
  listProjects,
  getProject,
  moveTaskToSection,
  PROJECTS_MARKER_RECHECK_MS,
  ProjectsUnavailableError,
  resetProjectsMarkerCacheForTests,
} from "../projectsRepo.js"

type Calls = { marker: number; other: number }

/** A fake db: the marker select answers `markerRows`; anything else throws `otherError` or counts. */
function fakeDb(opts: { markerRows?: unknown[]; markerError?: Error; otherError?: unknown }, calls: Calls): Db {
  const chain = (onAwait: () => Promise<unknown>) => {
    const c: Record<string, unknown> = {}
    for (const m of ["from", "where", "limit", "orderBy", "for"]) c[m] = () => c
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => onAwait().then(res, rej)
    return c
  }
  return {
    select: (fields?: Record<string, unknown>) =>
      chain(async () => {
        if (fields && "key" in fields) {
          calls.marker += 1
          if (opts.markerError) throw opts.markerError
          return opts.markerRows ?? []
        }
        calls.other += 1
        if (opts.otherError) throw opts.otherError
        return []
      }),
    transaction: async () => {
      calls.other += 1
      if (opts.otherError) throw opts.otherError
      return null
    },
  } as unknown as Db
}

test("marker missing: every call is ProjectsUnavailableError and no other query runs", async () => {
  resetProjectsMarkerCacheForTests()
  const calls = { marker: 0, other: 0 }
  const database = fakeDb({ markerRows: [] }, calls)
  await assert.rejects(listProjects("luke@x.au", {}, database), ProjectsUnavailableError)
  await assert.rejects(getProject(1, "luke@x.au", database), ProjectsUnavailableError)
  await assert.rejects(moveTaskToSection(1, 2, "luke@x.au", { task_id: 3, sort_order: null }, database), ProjectsUnavailableError)
  assert.equal(calls.other, 0, "nothing reads the new tables or columns")
})

test("a missing marker is cached for the recheck window, then read again", async () => {
  resetProjectsMarkerCacheForTests()
  const calls = { marker: 0, other: 0 }
  const t0 = 1_000_000
  assert.equal(await isProjectsMigrationApplied(fakeDb({ markerRows: [] }, calls), t0), false)
  assert.equal(await isProjectsMigrationApplied(fakeDb({ markerRows: [] }, calls), t0 + 1_000), false)
  assert.equal(calls.marker, 1, "second call inside the window does not query")
  assert.equal(
    await isProjectsMigrationApplied(fakeDb({ markerRows: [{ key: "0118_codex_s1_projects" }] }, calls), t0 + PROJECTS_MARKER_RECHECK_MS),
    true
  )
  assert.equal(calls.marker, 2)
})

test("a present marker is cached for good; a failed read is not cached", async () => {
  resetProjectsMarkerCacheForTests()
  const calls = { marker: 0, other: 0 }
  const t0 = 5_000_000
  assert.equal(await isProjectsMigrationApplied(fakeDb({ markerError: new Error("down") }, calls), t0), false)
  assert.equal(await isProjectsMigrationApplied(fakeDb({ markerRows: [{ key: "x" }] }, calls), t0 + 1), true, "error was not cached")
  assert.equal(await isProjectsMigrationApplied(fakeDb({ markerRows: [] }, calls), t0 + 2), true, "seen is sticky")
  assert.equal(calls.marker, 2)
  resetProjectsMarkerCacheForTests()
})

test("a table or column missing mid-query (42P01, 42703, also as a cause) is ProjectsUnavailableError", async () => {
  for (const code of ["42P01", "42703"]) {
    resetProjectsMarkerCacheForTests()
    const calls = { marker: 0, other: 0 }
    const wrapped = Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("x"), { code }) })
    const database = fakeDb({ markerRows: [{ key: "0118_codex_s1_projects" }], otherError: wrapped }, calls)
    await assert.rejects(listProjects("luke@x.au", {}, database), ProjectsUnavailableError)
    assert.equal(calls.other, 1)
  }
  resetProjectsMarkerCacheForTests()
})

test("other database errors are not hidden as 'not applied'", async () => {
  resetProjectsMarkerCacheForTests()
  const calls = { marker: 0, other: 0 }
  const database = fakeDb(
    { markerRows: [{ key: "0118_codex_s1_projects" }], otherError: Object.assign(new Error("deadlock"), { code: "40P01" }) },
    calls
  )
  await assert.rejects(listProjects("luke@x.au", {}, database), (e: unknown) => !(e instanceof ProjectsUnavailableError))
  resetProjectsMarkerCacheForTests()
})

test("isMissingProjectsSchema", () => {
  assert.equal(isMissingProjectsSchema(Object.assign(new Error(), { code: "42P01" })), true)
  assert.equal(isMissingProjectsSchema(Object.assign(new Error(), { code: "42703" })), true)
  assert.equal(isMissingProjectsSchema(Object.assign(new Error(), { code: "23505" })), false)
  assert.equal(isMissingProjectsSchema(null), false)
})
