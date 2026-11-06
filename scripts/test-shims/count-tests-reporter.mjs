/**
 * node:test reporter for scripts/run-node-test-files.mjs (B28, B27 review M-1).
 *
 * Counts, per test file, the tests that ran (passed or failed) and the ones
 * skipped or marked todo. A suite (`describe`) is not a test. Node also
 * reports a file with no tests, or a file that fails to load, as one test
 * named after the file; that one is not counted either. At the end it writes
 * one JSON object: `{ "<absolute file>": { "ran": n, "skipped": n, "todo": n } }`.
 */
import path from "node:path"

export default async function* countTests(source) {
  /** @type {Record<string, { ran: number; skipped: number; todo: number }>} */
  const counts = {}
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue
    const { file, name, nesting, skip, todo, details } = event.data
    if (!file || details?.type !== "test") continue
    if (nesting === 0 && path.resolve(String(name)) === path.resolve(file)) continue
    const row = (counts[file] ??= { ran: 0, skipped: 0, todo: 0 })
    if (skip !== undefined) row.skipped++
    else if (todo !== undefined) row.todo++
    else row.ran++
  }
  yield JSON.stringify(counts)
}
