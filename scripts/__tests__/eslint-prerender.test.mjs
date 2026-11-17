/**
 * Self-test for the prerender lint rule (eslint.config.mjs, B55fix, S27). A
 * page or layout that exports `dynamic = "force-static"` (or `"error"`),
 * `revalidate` or `generateStaticParams` fails lint: it would be prerendered,
 * and a prerendered page's scripts get no CSP nonce. API routes keep their
 * `revalidate`. Pages keep the hex and C-200 selectors the rule sits beside,
 * and a page given its own C-200 block (FINALfix X5) keeps the rule too.
 * ESLint runs as a process (`eslint` is not a listed dependency).
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

/** ESLint over `args`: the no-restricted-syntax messages per repo path. */
function lint(args, input) {
  const run = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--format", "json", "--no-warn-ignored", ...args], { cwd: repo, input, encoding: "utf8", maxBuffer: 1 << 26 })
  assert.ok(run.stdout, run.stderr)
  const out = {}
  for (const r of JSON.parse(run.stdout)) {
    assert.deepEqual(r.messages.filter((m) => m.fatal), [], r.filePath)
    out[path.relative(repo, r.filePath)] = r.messages.filter((m) => m.ruleId === "no-restricted-syntax")
  }
  return out
}
const isPrerender = (m) => m.message.includes("CSP nonce")
/** Lines of `src` that fail the prerender rule when linted as `file`. */
function prerenderLines(file, src) {
  const messages = lint(["--stdin", "--stdin-filename", file], src.join("\n"))[file] ?? []
  return [...new Set(messages.filter(isPrerender).map((m) => m.line))].sort((a, b) => a - b)
}
const each = (src) => src.map((_, i) => i + 1)

const PLANTED = [
  'export const dynamic = "force-static"',
  "export const dynamic = 'error'",
  'export const dynamic = "force-static" as const',
  "export const revalidate = 60",
  "export const revalidate = false",
  "export async function generateStaticParams() { return [] }",
  "export const generateStaticParams = async () => []",
  "const r = 30; export { r as revalidate }",
]

const ALLOWED = [
  'export const dynamic = "force-dynamic"',
  'export const runtime = "nodejs"',
  "const revalidate = 60; export const ttl = revalidate",
  "export default function Page() { return null }",
]

test("a page or layout that would be prerendered fails lint, naming the CSP nonce", () => {
  for (const file of ["app/zz-prerender/page.tsx", "app/zz-prerender/layout.tsx", "app/(group)/zz/[id]/page.tsx", "app/tasks/zz-prerender/page.tsx"]) {
    assert.deepEqual(prerenderLines(file, PLANTED), each(PLANTED), file)
  }
})

test("per-request pages, API routes and components pass", () => {
  assert.deepEqual(prerenderLines("app/zz-prerender/page.tsx", ALLOWED), [])
  for (const file of ["app/api/zz-prerender/route.ts", "components/zz-prerender.tsx", "lib/zz-prerender.ts"]) {
    assert.deepEqual(prerenderLines(file, PLANTED), [], file)
  }
})

test("pages keep the hex and C-200 URL selectors beside the prerender rule", () => {
  const src = ['export const c = "#ffffff"', 'export const u = "/api/codex/tasks"', "export const revalidate = 1"]
  const page = lint(["--stdin", "--stdin-filename", "app/zz-prerender/page.tsx"], src.join("\n"))["app/zz-prerender/page.tsx"]
  assert.deepEqual(page.map((m) => m.line), [1, 2, 3])
  // The Tasks zone has hex but no URL selector, as before.
  const tasks = lint(["--stdin", "--stdin-filename", "app/tasks/zz-prerender/page.tsx"], src.join("\n"))["app/tasks/zz-prerender/page.tsx"]
  assert.deepEqual(tasks.map((m) => m.line), [1, 3])
})

test("no page or layout in app/ is prerendered today", () => {
  const out = lint(["app/**/page.tsx", "app/**/layout.tsx"])
  assert.ok(Object.keys(out).includes("app/privacy/page.tsx"), "the legal pages are linted")
  const prerendered = Object.entries(out).filter(([, messages]) => messages.some(isPrerender)).map(([file]) => file)
  assert.deepEqual(prerendered, [])
})

test("a page with its own C-200 block (a governed file) keeps the prerender rule, beside hex and URL", () => {
  const file = "app/zz-governed/page.tsx"
  const dir = mkdtempSync(path.join(tmpdir(), "c200-page-"))
  try {
    // The block codexImportBlocks gives a governed file: its syntax, then the Codex specifier selectors.
    const config = path.join(dir, "eslint.config.mjs")
    writeFileSync(
      config,
      [
        `import base, { c200SyntaxFor } from ${JSON.stringify(path.join(repo, "eslint.config.mjs"))}`,
        `import { CODEX_SPECIFIER_SELECTORS } from ${JSON.stringify(path.join(repo, "scripts/codex-boundary.mjs"))}`,
        `const file = ${JSON.stringify(file)}`,
        'export default [...base, { files: [file], rules: { "no-restricted-syntax": ["error", ...c200SyntaxFor(file), ...CODEX_SPECIFIER_SELECTORS] } }]',
      ].join("\n"),
    )
    const src = [...PLANTED, 'export const c = "#ffffff"', 'export const u = "/api/codex/tasks"']
    const messages = lint(["-c", config, "--stdin", "--stdin-filename", file], src.join("\n"))[file]
    const lines = (pick) => [...new Set(messages.filter(pick).map((m) => m.line))].sort((a, b) => a - b)
    assert.deepEqual(lines(isPrerender), each(PLANTED))
    assert.deepEqual(lines((m) => !isPrerender(m)), [PLANTED.length + 1, PLANTED.length + 2], "hex and URL")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
