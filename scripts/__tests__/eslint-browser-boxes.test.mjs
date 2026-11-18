/**
 * Self-test for the browser box lint rule (eslint.config.mjs, B57). Client
 * code in app, components, hooks, contexts and lib may not call the browser's
 * confirm(), alert() or prompt(), bare or on window or globalThis: the message
 * names useConfirm. A local binding named confirm (the helper's own, or a
 * component's function) and a property of another object pass. Tests are
 * excepted. app and lib keep the Window globals rule beside it. ESLint runs as
 * a process (`eslint` is not a listed dependency).
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const RULES = new Set(["no-restricted-globals", "no-restricted-properties"])

/** Lines of `src` that fail the browser box rule (or the Window globals rule) when linted as `file`. */
function failing(file, src, pick = (m) => m.message.includes("useConfirm")) {
  const run = spawnSync(
    path.join(repo, "node_modules/.bin/eslint"),
    ["--format", "json", "--no-warn-ignored", "--stdin", "--stdin-filename", file],
    { cwd: repo, input: src.join("\n"), encoding: "utf8", maxBuffer: 1 << 26 },
  )
  assert.ok(run.stdout, run.stderr)
  const [result] = JSON.parse(run.stdout)
  assert.deepEqual(result.messages.filter((m) => m.fatal), [], file)
  const lines = result.messages.filter((m) => RULES.has(m.ruleId) && pick(m)).map((m) => m.line)
  return [...new Set(lines)].sort((a, b) => a - b)
}
const each = (src) => src.map((_, i) => i + 1)

const PLANTED = [
  'export const a = () => confirm("Delete?")',
  'export const b = () => alert("Saved")',
  'export const c = () => prompt("Name?")',
  'export const d = () => window.confirm("Delete?")',
  'export const e = () => window.alert("Saved")',
  'export const f = () => window.prompt("Name?")',
  'export const g = () => globalThis.confirm("Delete?")',
  "export const h = () => { const ask = window.confirm; return ask }",
]

const ALLOWED = [
  'import { useConfirm } from "@/hooks/use-confirm"',
  'export function useX() { const { confirm, notice } = useConfirm(); return () => confirm({ title: "Delete?" }).then(() => notice({ title: "Done" })) }',
  "export function Sheet() { const confirm = (x: number) => x; return confirm(1) }",
  "export const body = (b: { confirm: boolean }) => b.confirm === true",
  "export const label = (copy: { confirm: string }) => copy.confirm",
]

const CLIENT_FILES = [
  "app/zz-box/page.tsx",
  "app/api/zz-box/route.ts",
  "components/zz-box.tsx",
  "hooks/use-zz-box.ts",
  "contexts/ZzBox.tsx",
  "lib/zz-box.ts",
]

test("a browser box in client code fails lint, naming useConfirm", () => {
  for (const file of CLIENT_FILES) assert.deepEqual(failing(file, PLANTED), each(PLANTED), file)
})

test("the helper's own confirm, a local function, and another object's property pass", () => {
  for (const file of CLIENT_FILES) assert.deepEqual(failing(file, ALLOWED), [], file)
})

test("tests and scripts are excepted", () => {
  for (const file of ["components/__tests__/zz-box.test.tsx", "lib/zz-box.test.ts", "app/zz/__tests__/helper.ts", "scripts/zz-box.mjs"]) {
    assert.deepEqual(failing(file, PLANTED), [], file)
  }
})

test("app and lib keep the Window globals rule beside it; components do not gain it", () => {
  const src = ["export const s = () => status", 'export const a = () => alert("x")']
  const any = () => true
  assert.deepEqual(failing("app/zz-box/page.tsx", src, any), [1, 2])
  assert.deepEqual(failing("lib/zz-box.ts", src, any), [1, 2])
  assert.deepEqual(failing("components/zz-box.tsx", src, any), [2])
})
