/** Self-test for scripts/check-any-ratchet.mjs (B7, G3). */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { countAny } from "../check-any-ratchet.mjs"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../check-any-ratchet.mjs")

test("countAny counts each any once, plus @ts-ignore", () => {
  assert.equal(countAny("let a: any = 1"), 1)
  assert.equal(countAny("let a: any[] = []"), 1)
  assert.equal(countAny("const b = x as any"), 1)
  assert.equal(countAny("const b = x as any[]"), 1)
  assert.equal(countAny("type T = Promise<any[]>"), 1)
  assert.equal(countAny("function f(a: any, b: any): any { return a as any }"), 4)
  assert.equal(countAny("// @ts-ignore\nconst c = 1"), 1)
})

test("countAny ignores comments, strings and words that start with any", () => {
  assert.equal(countAny("// a: any\n/* b as any */\nconst s = 'x: any as any any[] Record<string, any>'"), 0)
  assert.equal(countAny("const t = `${'a'}: any`"), 0)
  assert.equal(countAny("const o = { k: anyValue, j: anything }"), 0)
  assert.equal(countAny("type Company = string; type Anyway = number"), 0)
  assert.equal(countAny("type R = Record<string, anything>"), 0)
})

test("B7 review: type arguments, unions, type aliases and the other ts directives count", () => {
  assert.equal(countAny("type R = Record<string, any>"), 1)
  assert.equal(countAny("const a: Array<any> = []"), 1)
  assert.equal(countAny("async function f(): Promise<any> { return 1 }"), 1)
  assert.equal(countAny("let u: string | any"), 1)
  assert.equal(countAny("type I = A & any"), 1)
  assert.equal(countAny("type T = any"), 1)
  assert.equal(countAny("type Company = any"), 1, "the any, not the 'any' inside Company")
  assert.equal(countAny("type G<U> = any"), 1)
  assert.equal(countAny("const [s] = useState<any[]>([])"), 1, "<any[]> once")
  assert.equal(countAny("const m = new Map<string, any>()"), 1)
  assert.equal(countAny("// @ts-expect-error\nconst a = 1"), 1)
  assert.equal(countAny("// @ts-nocheck\nconst a = 1"), 1)
  assert.equal(countAny("// @ts-ignore\n// @ts-expect-error\n// @ts-nocheck"), 3)
})

test("B8 review 6: in .tsx files the word any in JSX text is not counted; real anys around it are", () => {
  const jsx = { jsx: true }
  assert.equal(countAny("export const C = () => <p>Pick a client, any client</p>", jsx), 0)
  assert.equal(countAny("export const C = () => <span>Fees & any extras</span>", jsx), 0)
  assert.equal(countAny("export const C = () => <li>Search | any channel</li>", jsx), 0)
  assert.equal(countAny("export const C = () => <p>Don't pick any</p>\nconst a: any = 1", jsx), 1, "an apostrophe in JSX text hides nothing")
  assert.equal(countAny("export const C = (p: any) => <p title={p as any}>{(p as any).x}, any</p>", jsx), 3)
  assert.equal(countAny("export const C = () => <Foo<any> />", jsx), 1, "a JSX type argument is code")
  assert.equal(countAny("function f<T = any>() {}\nexport const C = () => <p>,any</p>", jsx), 0, "`<T = any>` was never counted")
  // .ts files have no JSX: the text pass is off, so nothing changes there.
  assert.equal(countAny("let u: string | any"), 1)
  assert.equal(countAny("const x = a < any"), 1, "a .ts comparison-looking form still counts as before")
})

function makeRoot(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-ratchet-"))
  for (const [rel, src] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, src)
  }
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true })
  if (baseline) fs.writeFileSync(path.join(root, "scripts/any-ratchet-baseline.json"), JSON.stringify(baseline))
  return root
}
const run = (root, ...args) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" })
const readBaseline = (root) => JSON.parse(fs.readFileSync(path.join(root, "scripts/any-ratchet-baseline.json"), "utf8"))

test("scope: app, lib, components, src, hooks, contexts, middleware.ts; tests and scripts excluded", () => {
  const root = makeRoot(
    {
      "app/a.ts": "export const a: any = 1",
      "lib/b.tsx": "export const b = 1 as any",
      "components/c.tsx": "export const c: any[] = []",
      "src/d.ts": "export const d: any = 1",
      "hooks/e.ts": "export const e: any = 1",
      "contexts/f.tsx": "export const f: any = 1",
      "middleware.ts": "export const m: any = 1",
      "lib/__tests__/t.ts": "export const t: any = 1",
      "lib/x.test.ts": "export const t: any = 1",
      "scripts/s.ts": "export const s: any = 1",
      "lib/types.d.ts": "export declare const g: any",
    },
    null,
  )
  try {
    assert.equal(run(root, "--reseed").status, 0)
    assert.deepEqual(Object.keys(readBaseline(root)).sort(), [
      "app/a.ts",
      "components/c.tsx",
      "contexts/f.tsx",
      "hooks/e.ts",
      "lib/b.tsx",
      "middleware.ts",
      "src/d.ts",
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a rise or a new file fails, and --update never raises the baseline", () => {
  const root = makeRoot({ "lib/x.ts": "export const a: any = 1\nexport const b: any = 2", "lib/y.ts": "export const c: any = 1" }, { "lib/x.ts": 1 })
  try {
    const r = run(root)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /lib\/x\.ts: 2 \(baseline 1\)/)
    assert.match(r.stderr, /lib\/y\.ts: 1 \(baseline 0, new file\)/)
    assert.equal(run(root, "--update").status, 1)
    assert.deepEqual(readBaseline(root), { "lib/x.ts": 1 })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a drop passes, and --update lowers the count and drops files at 0", () => {
  const root = makeRoot({ "lib/x.ts": "export const a: any = 1", "lib/y.ts": "export const c = 1" }, { "lib/x.ts": 3, "lib/y.ts": 1 })
  try {
    const r = run(root)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /3 under baseline/)
    assert.equal(run(root, "--update").status, 0)
    assert.deepEqual(readBaseline(root), { "lib/x.ts": 1 })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("B8 review 6: the scan treats .tsx files as JSX, so on-screen 'any' copy can't fail a PR", () => {
  const root = makeRoot(
    {
      "components/Copy.tsx": "export const C = () => <p>Pick a client, any client. Fees & any extras.</p>",
      "components/Real.tsx": "export const R = (p: any) => <p>{p}</p>",
    },
    { "components/Real.tsx": 1 },
  )
  try {
    const r = run(root)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /ok \(1 files, 1\)/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
