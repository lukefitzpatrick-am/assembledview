/**
 * One test runner. Test files are found by name, never listed (B47, S29 A).
 *
 * - A test file is any `*.test.{ts,tsx,mts,mjs,cjs}` or `*.node-test.ts`
 *   outside node_modules (anywhere) and `dist`, `coverage` and dot folders
 *   (repo root only). A `*.test.js`, `*.test.jsx` or `*.spec.*` file fails the
 *   run by name: no runner takes it.
 * - A file that imports `vitest` runs in Vitest (`vitest.config.ts` reads
 *   the same list). A file that imports `node:test` runs in node:test with
 *   the route shims (module mocks, server-only, tsx). A test file that
 *   imports neither, or both, fails the run: it would run nowhere.
 * - node:test files go to `run({ files })` as literal paths, so a path with
 *   `[slug]` runs (C-179: `node --test <path>` reads it as a glob and runs 0).
 * - A node:test file that reports no test at all (none ran, skipped or todo)
 *   fails the run. A skipped suite counts as skipped, so a database suite with
 *   no database passes as skipped.
 * - A node:test file's results must add up (RUNFIX). The run fails, naming the
 *   file and its counts, when the file exits non-zero or times out, when its
 *   own summary never arrives, or when it reports fewer results (pass, fail,
 *   skip or todo, suites included) than tests it started.
 * - No `forceExit`: it made each child call process.exit() once its known tests
 *   ended, which dropped the tail of its results still queued on the pipe and
 *   never ran a test registered after a top-level await. A file that hangs is
 *   stopped by FILE_TIMEOUT_MS instead.
 * - Every test child runs with TZ=UTC, as CI and Vercel do, so a zone-less
 *   formatter built at module load cannot pass here on a Melbourne host.
 * - run() starts each file with this process's exec flags too, so start the
 *   runner as a file (`node scripts/run-tests.mjs`), never with `node -e`.
 *
 * usage: node scripts/run-tests.mjs [prefix ...]
 *   No prefix runs every test file. A prefix selects the files whose repo
 *   path (forward slashes) starts with it: a folder, a file, or a file stem.
 *   The named `test:*` scripts in package.json are prefixes of this runner.
 */
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { run } from "node:test"
import { spec, tap } from "node:test/reporters"

import { findTests, ROOT } from "./test-files.mjs"

const SHIMS = [
  "--experimental-test-module-mocks",
  "--import",
  "./scripts/test-shims/register-server-only.mjs",
  "--require",
  "./scripts/test-shims/mock-server-only.cjs",
  "--import",
  "tsx",
]

// A per-file cap (run()'s `timeout`, inherited by each file's test), so a file whose process never ends
// fails by name. The slowest file of 240 took 6 s on a loaded 2-core box; 5 minutes leaves room and still
// fits CI's 40-minute job. Node's own default is no limit.
const FILE_TIMEOUT_MS = 5 * 60 * 1000

/** The files a list of prefixes selects (all when there is none). */
export function selectTests(tests, prefixes) {
  return prefixes.length === 0 ? tests : tests.filter((t) => prefixes.some((p) => t.file.startsWith(p)))
}

/** node:test files that reported no test: `counts` is keyed by absolute path. */
function filesWithNoTests(files, counts, root = ROOT) {
  return files.filter((f) => {
    const row = counts.get(path.resolve(root, f))
    return !row || row.ran + row.skipped + row.todo === 0
  })
}

/** Why Node failed a file's own placeholder test: a timeout, a signal or an exit code. */
function exitReason(err) {
  if (err?.failureType === "testTimeoutFailure") return `timed out after ${FILE_TIMEOUT_MS / 1000} s`
  return err?.signal ? `killed by ${err.signal}` : `exit code ${err?.exitCode ?? err?.failureType}`
}

/** Why a file's results do not add up, or null when they do. */
function shortfall(row) {
  if (row.exit) return row.exit
  if (!row.summary) return "exited without its summary"
  if (row.results < row.started) return "fewer results than tests started"
  return null
}

function moduleMocksWork() {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const probe = `import { mock } from "node:test"; process.exit(typeof mock.module === "function" ? 0 : 3)`
  return spawnSync(process.execPath, [SHIMS[0], "--input-type=module", "-e", probe], { env }).status === 0
}

async function runNode(files, root) {
  if (!moduleMocksWork()) {
    console.error(`[run-tests] Node ${process.versions.node} has no mock.module under ${SHIMS[0]}: tests that need it would skip`)
    return { ok: false, ran: 0, skipped: 0, todo: 0 }
  }
  const counts = new Map()
  const rowOf = (file) => {
    if (!counts.has(file)) counts.set(file, { ran: 0, skipped: 0, todo: 0, started: 0, results: 0, summary: null, exit: null })
    return counts.get(file)
  }
  let failed = 0
  const stream = run({
    files: files.map((f) => path.resolve(root, f)),
    execArgv: SHIMS,
    isolation: "process",
    concurrency: os.availableParallelism(),
    timeout: FILE_TIMEOUT_MS,
  })
  stream.on("test:fail", (e) => {
    if (e.todo === undefined) failed++
  })
  stream.on("test:enqueue", ({ file }) => {
    if (file) rowOf(file).started++
  })
  stream.on("test:summary", ({ file, counts: c }) => {
    if (file) rowOf(file).summary = c
  })
  for (const type of ["test:pass", "test:fail"]) {
    stream.on(type, ({ file, name, nesting, skip, todo, details }) => {
      if (!file) return
      const row = rowOf(file)
      if (nesting === 0 && path.resolve(String(name)) === path.resolve(file)) {
        // Node's placeholder for the file: it fails when the process exits non-zero (no failed test to blame) or times out.
        if (type === "test:fail") row.exit = exitReason(details?.error)
        return
      }
      row.results++
      // A suite counts only when it is skipped as a whole (`describe(..., { skip })`, a DB suite with no database).
      if (details?.type !== "test" && !(details?.type === "suite" && skip !== undefined)) return
      if (skip !== undefined) row.skipped++
      else if (todo !== undefined) row.todo++
      else row.ran++
    })
  }
  const out = stream.compose(process.stdout.isTTY ? spec : tap)
  out.pipe(process.stdout)
  await new Promise((resolve) => out.on("end", resolve))
  const rows = [...counts.values()]
  const total = (k) => rows.reduce((sum, r) => sum + r[k], 0)
  const empty = filesWithNoTests(files, counts, root)
  for (const f of empty) console.error(`[run-tests] ${f}: no test ran, skipped or todo. A file with no test fails the run.`)
  const short = files.filter((f) => counts.has(path.resolve(root, f)) && shortfall(counts.get(path.resolve(root, f))))
  for (const f of short) {
    const row = counts.get(path.resolve(root, f))
    const sum = row.summary ? row.summary.tests + row.summary.suites : "none"
    console.error(`[run-tests] ${f}: ${shortfall(row)} (started ${row.started}, results ${row.results}, summary ${sum}). Its results do not add up, so the run fails.`)
  }
  const ok = failed === 0 && empty.length === 0 && short.length === 0
  return { ok, ran: total("ran"), skipped: total("skipped"), todo: total("todo") }
}

/** Vitest reads its file list from `vitest.config.ts`; a selection passes the chosen files as its filters. */
function runVitest(files, root) {
  const bin = path.join(root, "node_modules", "vitest", "vitest.mjs")
  return spawnSync(process.execPath, [bin, "run", ...files], { cwd: root, stdio: "inherit" }).status === 0
}

export async function main(prefixes, root = ROOT) {
  const started = Date.now()
  process.env.TZ = "UTC" // inherited by every test child (node:test and Vitest), as on CI and Vercel
  const tests = findTests(root)
  if (tests.length === 0) {
    console.error(`[run-tests] found no test files under ${root}`)
    return 1
  }
  const orphans = tests.filter((t) => t.runner === null)
  for (const t of orphans) {
    console.error(
      `[run-tests] ${t.file}: no runner takes it. A test file is named *.test.{ts,tsx,mts,mjs,cjs} or *.node-test.ts and imports vitest or node:test, not both.`,
    )
  }
  const picked = selectTests(tests, prefixes)
  if (picked.length === 0) {
    console.error(`[run-tests] no test file starts with ${prefixes.join(", ")}`)
    return 1
  }
  const nodeFiles = picked.filter((t) => t.runner === "node").map((t) => t.file)
  const vitestFiles = picked.filter((t) => t.runner === "vitest").map((t) => t.file)
  const node = nodeFiles.length ? await runNode(nodeFiles, root) : { ok: true, ran: 0, skipped: 0, todo: 0 }
  const vitestOk = vitestFiles.length ? runVitest(prefixes.length ? vitestFiles : [], root) : true
  const secs = Math.round((Date.now() - started) / 1000)
  console.log(
    `# run-tests: node:test files ${nodeFiles.length} (ran ${node.ran}, skipped ${node.skipped}, todo ${node.todo}), ` +
      `vitest files ${vitestFiles.length}, ${secs}s`,
  )
  return node.ok && vitestOk && orphans.length === 0 ? 0 : 1
}

// By file name, not a resolved path: a drive letter case or junction on Windows would make a path compare fail and exit 0 having run nothing.
if (path.basename(process.argv[1] ?? "") === "run-tests.mjs") {
  process.chdir(ROOT)
  process.exitCode = await main(process.argv.slice(2))
}
