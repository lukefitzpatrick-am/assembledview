/**
 * Self-test for scripts/check-egress-guards.mjs (B7, B6 review M-1/M-2/M-3).
 * Each probe is one small source file. CAUGHT probes must give a rule 2 hit,
 * ALLOWED probes none. KNOWN_GAPS pins what the header says is not caught;
 * if the guard learns one, move it to CAUGHT and update the header.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { maskNonCode, scanFile, xanoEgressHits } from "../check-egress-guards.mjs"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../check-egress-guards.mjs")

/** [relative path, source] */
const CAUGHT = [
  ["lib/host_string.ts", `export const u = "https://x8ki-letl-twmt.n7.xano.io/api:abc/clients"`],
  ["lib/host_template_sub.ts", 'const sub = "x"; export const u = `https://${sub}.n7.xano.io/api`'],
  // M-1: the interpolation's closing } is kept, so this is one host.
  ["lib/host_template_interp.ts", 'const sub = "x"; export const u = `https://${sub}.xano.io/api`'],
  ["lib/host_template_no_scheme.ts", 'const base = "x"; export const u = `${base}.xano.io`'],
  ["lib/host_template_after.ts", 'const p = "/api"; export const u = `https://x8ki.xano.io${p}`'],
  ["lib/host_concat_dot.ts", `const sub = "x"; export const u = "https://" + sub + ".xano.io/api"`],
  ["lib/host_new_url.ts", `export const u = new URL("/api", "https://" + "x8ki" + ".xano.io")`],
  // M-1: case-insensitive host.
  ["lib/host_upper.ts", `export const u = "https://X8KI.XANO.IO/api"`],
  ["lib/host_bare_root.ts", `export const u = "https://xano.io/api"`],
  ["lib/host_vault_literal.ts", `export const legacy = "https://a2.xano.io/vault/mba.pdf"`],
  ["lib/host_string_with_slashes.ts", `export const s = "see // https://a2.xano.io/vault/x.pdf"`],
  // M-3: a quote or slash inside a regex literal no longer hides what follows.
  ["lib/regex_with_quote.ts", `export const re = /["']/g; export const u = "https://x8ki.xano.io/api"`],
  ["lib/regex_slash_quote.ts", `export const re = /a"b/; export const u = "https://x8ki.xano.io/api"`],
  ["lib/regex_escaped_slash.ts", `export const r = /^\\//; export const u = "https://x8ki.xano.io/api"`],
  ["lib/division_then_string.ts", `export const a = 4 / 2; export const u = "https://x8ki.xano.io/api"`],
  ["lib/after_emoji.ts", "export const e = `🔴 ${1}`; export const u = \"https://x8ki.xano.io/api\""],
  ["lib/env_dot.ts", `export const u = process.env.XANO_BASE_URL`],
  ["lib/env_bracket.ts", `export const u = process.env["XANO_BASE_URL"]`],
  ["lib/env_bracket_concat.ts", `const x = "BASE_URL"; export const u = process.env["XANO_" + x]`],
  ["lib/env_bracket_template.ts", 'const x = "BASE_URL"; export const u = process.env[`XANO_${x}`]'],
  // M-2
  ["lib/env_destructure.ts", `const { XANO_BASE_URL } = process.env; export const u = XANO_BASE_URL`],
  ["lib/env_destructure_rename.ts", `const { FOO, XANO_KEY: key } = process.env; export const u = key + FOO`],
  ["lib/env_optional.ts", `export const u = process.env?.XANO_BASE_URL`],
  ["lib/env_optional_bracket.ts", `export const u = process.env?.["XANO_BASE_URL"]`],
  ["lib/env_next_public.ts", `export const u = process.env.NEXT_PUBLIC_XANO_BASE_URL`],
  ["lib/env_next_public_bracket.ts", `export const u = process.env["NEXT_PUBLIC_XANO_BASE_URL"]`],
  ["lib/env_process_bracket.ts", `export const u = process["env"].XANO_BASE_URL`],
  ["lib/env_process_bracket_key.ts", `export const u = process['env']['XANO_BASE_URL']`],
  ["lib/env_whitespace.ts", "export const u = process.env\n  .XANO_BASE_URL"],
  ["lib/env_lowercase.ts", `export const u = process.env.xano_base_url`],
  ["lib/env_global_this.ts", `export const u = globalThis.process.env.XANO_BASE_URL`],
  // Widened scope.
  ["components/env.tsx", `export const u = process.env.XANO_BASE_URL`],
  ["components/host.tsx", `export const u = "https://x8ki.xano.io/api"`],
  ["src/host.ts", `export const u = "https://x8ki.xano.io/api"`],
  ["hooks/useX.ts", `export const u = process.env.NEXT_PUBLIC_XANO_URL`],
  ["contexts/X.tsx", `export const u = process.env.XANO_URL`],
  ["middleware.ts", `export const u = process.env.XANO_BASE_URL`],
  // B7 review: more runtime code in scope.
  ["db/index.ts", `export const u = process.env.XANO_BASE_URL`],
  ["db/client.ts", `export const u = "https://x8ki.xano.io/api"`],
  ["instrumentation.ts", `export const u = process.env.XANO_BASE_URL`],
  ["instrumentation.node.ts", `export const u = "https://x8ki.xano.io/api"`],
  ["next.config.mjs", `export default { env: { A: process.env.XANO_BASE_URL } }`],
  ["lib/specs/parse.cjs", `module.exports = process.env.XANO_BASE_URL`],
  ["lib/x.mts", `export const u = "https://x8ki.xano.io/api"`],
  ["lib/y.cts", `export const u = process.env.XANO_BASE_URL`],
  // B7 review: nested destructure and env object aliases.
  ["lib/env_nested_destructure.ts", `const { env: { XANO_KEY } } = process; export const u = XANO_KEY`],
  ["lib/env_nested_destructure_multi.ts", `const { argv, env: { HOME, XANO_KEY: k } } = process; export const u = k + HOME + argv`],
  ["lib/env_rest_alias.ts", `const { DATABASE_URL, ...rest } = process.env; export const u = rest.XANO_KEY + DATABASE_URL`],
  ["lib/env_rest_alias_bracket.ts", `const { A, ...others } = process.env; export const u = others["XANO_KEY"] + A`],
  ["lib/env_alias.ts", `const env = process.env; export const u = env.XANO_BASE_URL`],
  ["lib/env_alias_optional.ts", `let e = process["env"]; export const u = e?.XANO_BASE_URL`],
  // B8 review 4: more same-file alias and cast forms.
  ["lib/env_destructure_env.ts", `const { env } = process; export const u = env.XANO_BASE_URL`],
  ["lib/env_destructure_env_rename.ts", `const { argv, env: e } = process; export const u = e.XANO_KEY + argv`],
  ["lib/env_destructure_env_bracket.ts", `const { env } = process; export const u = env["XANO_KEY"]`],
  ["lib/env_typed_alias.ts", `const env: NodeJS.ProcessEnv = process.env; export const u = env.XANO_BASE_URL`],
  ["lib/env_typed_alias_record.ts", `const env: Record<string, string | undefined> = process.env; export const u = env.XANO_KEY`],
  ["lib/env_cast_any.ts", `export const u = (process.env as any).XANO_BASE_URL`],
  ["lib/env_cast_record_bracket.ts", `export const u = (process.env as Record<string, string>)["XANO_KEY"]`],
  ["lib/env_non_null.ts", `export const u = process.env!.XANO_BASE_URL`],
  ["lib/env_non_null_paren.ts", `export const u = (process.env!).XANO_BASE_URL`],
  ["lib/env_spread_copy.ts", `const env = { ...process.env }; export const u = env.XANO_BASE_URL`],
  ["lib/env_spread_copy_mixed.ts", `const env = { A: "1", ...process.env }; export const u = env["XANO_KEY"]`],
  ["lib/env_alias_assigned_later.ts", `let env; env = process.env; export const u = env.XANO_KEY`],
  ["lib/env_alias_destructure.ts", `const env = process.env; const { XANO_KEY } = env; export const u = XANO_KEY`],
  ["lib/env_alias_non_null.ts", `const env = process.env!; export const u = env!.XANO_KEY`],
  ["lib/env_global_process.ts", `export const u = global.process.env.XANO_BASE_URL`],
  ["lib/env_global_process_alias.ts", `const p = global.process; export const u = p.env.XANO_KEY`],
  ["lib/env_global_this_process_alias.ts", `const p = globalThis.process; export const u = p.env["XANO_KEY"]`],
  ["lib/env_process_alias.ts", `const p = process; export const u = p.env.XANO_KEY`],
  ["lib/env_global_destructure.ts", `const { env } = global.process; export const u = env.XANO_KEY`],
  ["lib/env_global_nested_destructure.ts", `const { env: { XANO_KEY } } = global.process; export const u = XANO_KEY`],
  // B10 (B8 review notes, finding 3): the process module imported or required,
  // bracketed globalThis, parentheses, satisfies, angle casts, empty defaults.
  ["lib/env_import_named.ts", `import { env } from "process"; export const u = env.XANO_KEY`],
  ["lib/env_import_named_node.ts", `import { env } from "node:process"; export const u = env.XANO_KEY`],
  ["lib/env_import_named_as.ts", `import { argv, env as e } from "node:process"; export const u = e["XANO_KEY"] + argv`],
  ["lib/env_import_default.ts", `import p from "process"; export const u = p.env.XANO_KEY`],
  ["lib/env_import_namespace.ts", `import * as p from "node:process"; export const u = p.env.XANO_KEY`],
  ["lib/env_import_default_and_named.ts", `import p, { env } from "process"; export const u = env.XANO_KEY + p.argv`],
  ["lib/env_require_destructure.ts", `const { env } = require("process"); export const u = env.XANO_KEY`],
  ["lib/env_require_alias.ts", `const p = require("node:process"); export const u = p.env.XANO_KEY`],
  ["lib/env_require_direct.ts", `export const u = require("process").env.XANO_KEY`],
  ["lib/env_require_nested.ts", `const { env: { XANO_KEY } } = require("process"); export const u = XANO_KEY`],
  ["lib/env_global_this_bracket.ts", `export const u = globalThis["process"].env.XANO_KEY`],
  ["lib/env_global_this_bracket_alias.ts", `const p = globalThis["process"]; export const u = p.env.XANO_KEY`],
  ["lib/env_paren_process.ts", `export const u = (process).env.XANO_KEY`],
  ["lib/env_paren_process_alias.ts", `const p = process; export const u = (p).env.XANO_KEY`],
  ["lib/env_double_paren.ts", `export const u = ((process.env)).XANO_KEY`],
  ["lib/env_angle_cast.ts", `export const u = (<any>process.env).XANO_KEY`],
  ["lib/env_satisfies.ts", `export const u = (process.env satisfies Record<string, string>).XANO_KEY`],
  ["lib/env_spread_paren.ts", `const e = ({ ...process.env }); export const u = e.XANO_KEY`],
  ["lib/env_destructure_default.ts", `const { env = {} } = process; export const u = env.XANO_KEY`],
  ["lib/env_destructure_default_rename.ts", `const { env: e = {} } = process; export const u = e.XANO_KEY`],
  ["lib/env_nested_destructure_paren.ts", `const { env: { XANO_KEY } } = (process); export const u = XANO_KEY`],
]

const ALLOWED = [
  ["lib/comment_line.ts", "// calls https://x8ki.n7.xano.io and process.env.XANO_BASE_URL\nexport const a = 1"],
  ["lib/comment_block.ts", "/* https://x8ki.n7.xano.io process.env.XANO_BASE_URL */ export const a = 1"],
  ["lib/jsdoc.ts", '/**\n * old: process.env["XANO_MEDIA_PLANS_BASE_URL"] at https://a2.xano.io/vault\n */\nexport const a = 1'],
  ["lib/comment_after_regex.ts", 'export const p = (v: string) => v.replace(/^\\//, "")\n// https://a2.xano.io/vault\nexport const a = 1'],
  ["lib/comment_after_emoji.ts", "export const e = `🔴 ${1}`\n// https://a2.xano.io/vault process.env.XANO_X\nexport const a = 1"],
  ["lib/vault_bare.ts", `export const isVault = (u: string) => u.toLowerCase().includes("xano.io")`],
  ["lib/vault_regex.ts", `export const isVault = (u: string) => /\\.xano\\.io\\//.test(u)`],
  [
    "lib/frozen_names.ts",
    `export const T = "ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT"; export const P = "/api/cron/xano-line-item-sync"; export const X_ROW = "XANO_ROW_ID"`,
  ],
  ["lib/xano_word.ts", `export class XanoPlanningAudienceError extends Error {}; export const m = "XANO_API_KEY missing"`],
  ["lib/xano_io_in_query.ts", `export const u = "https://example.com/redirect?to=xano.io"`],
  ["lib/not_xano_host.ts", `export const u = "https://notxano.io/api"`],
  ["lib/other_env.ts", `export const u = process.env.MY_XANO_THING ?? process.env.DATABASE_URL`],
  ["lib/jsx_closing.tsx", `export const C = () => <div>a/b</div>`],
  ["lib/__tests__/test_dir.ts", `export const u = process.env.XANO_BASE_URL + "https://a.xano.io"`],
  ["lib/file.test.ts", `export const u = process.env.XANO_BASE_URL + "https://a.xano.io"`],
  // Not scanned: outside the guard's dirs.
  ["scripts/tool.mjs", `export const u = process.env.XANO_BASE_URL`],
  ["lib/specs/__tests__/p.cjs", `module.exports = process.env.XANO_BASE_URL`],
  ["lib/z.test.cjs", `module.exports = process.env.XANO_BASE_URL`],
  ["db/frozen.ts", `export const T = "MART.XANO_LINE_ITEMS_SNAPSHOT"; export const P = "/api/cron/xano-line-item-sync"`],
  ["lib/alias_other_env.ts", `const env = process.env; export const u = env.DATABASE_URL + env.MY_XANO_THING`],
  ["lib/alias_member_not_alias.ts", `const url = process.env.DATABASE_URL; export const u = url + "x"`],
  ["lib/rest_other_env.ts", `const { A, ...rest } = process.env; export const u = rest.B + A`],
  ["lib/env_name_not_alias.ts", `export function f(env: Record<string, string>) { return env.XANO_KEY }`],
  // B8 review 4: the wider alias rules leave these alone.
  ["lib/alias_typed_other_env.ts", `const env: NodeJS.ProcessEnv = process.env; export const u = env.DATABASE_URL`],
  ["lib/cast_other_env.ts", `export const u = (process.env as any).DATABASE_URL + process.env!.MY_XANO_THING`],
  ["lib/spread_other_env.ts", `const env = { ...process.env }; export const u = env.DATABASE_URL`],
  ["lib/process_alias_other_env.ts", `const p = process; export const u = p.env.DATABASE_URL + p.argv`],
  ["lib/destructure_env_other.ts", `const { env } = process; export const u = env.DATABASE_URL`],
  ["lib/compare_not_alias.ts", `const env = {} as Record<string, string>; export const same = env === process.env; export const u = env.XANO_KEY`],
  // B10: the import, require and parenthesis rules leave these alone.
  ["lib/import_process_other_env.ts", `import { env } from "process"; export const u = env.DATABASE_URL`],
  ["lib/import_process_no_env.ts", `import { argv } from "process"; export const env = { XANO_KEY: 1 }; export const u = argv`],
  ["lib/import_local_process.ts", `import { env } from "./process"; export const u = env.XANO_KEY`],
  ["lib/import_processx.ts", `import p from "processx"; export const u = p.env.XANO_KEY`],
  ["lib/require_process_other_env.ts", `const { env } = require("process"); export const u = env.DATABASE_URL`],
  ["lib/require_child_process.ts", `const p = require("child_process"); export const u = p.env.XANO_KEY`],
  ["lib/global_this_bracket_other_env.ts", `export const u = globalThis["process"].env.DATABASE_URL`],
  ["lib/paren_process_other_env.ts", `export const u = (process).env.DATABASE_URL`],
  ["lib/destructure_default_other_env.ts", `const { env = {} } = process; export const u = env.DATABASE_URL`],
  ["lib/member_assign_not_alias.ts", `const o: { env?: unknown } = {}; o.env = process.env; export const u = { env: {} as Record<string, string> }.env.XANO_KEY`],
]

const KNOWN_GAPS = [
  ["lib/gap_host_split.ts", `export const u = "https://x8ki.xano" + ".io/api"`],
  ["lib/gap_host_join.ts", `export const u = ["https://x8ki", "xano", "io"].join(".")`],
  ["lib/gap_env_alias_other_file.ts", `import { env } from "./env"; export const u = env.XANO_BASE_URL`],
  ["lib/gap_env_key_var.ts", `const k = "XANO_BASE_URL"; export const u = process.env[k]`],
  ["lib/gap_env_helper.ts", `function requireEnv(n: string) { return process.env[n] } export const u = requireEnv("XANO_BASE_URL")`],
  ["lib/gap_import_meta.ts", `export const u = (import.meta as any).env.XANO_BASE_URL`],
  // B8 review 4: still not caught (no current code does this).
  ["lib/gap_object_assign_copy.ts", `const env = Object.assign({}, process.env); export const u = env.XANO_KEY`],
  ["lib/gap_alias_of_alias.ts", `const a = process.env; const b = a; export const u = b.XANO_KEY`],
  // B10: still not caught (no current code does this).
  ["lib/gap_dynamic_import.ts", `const { env } = await import("node:process"); export const u = env.XANO_KEY`],
  ["lib/gap_require_computed.ts", `const m = "process"; const p = require(m); export const u = p.env.XANO_KEY`],
]

function writeRoot(cases) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "egress-guard-"))
  for (const [rel, src] of cases) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, src)
  }
  return root
}

function runGuard(root) {
  return spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" })
}

test("maskNonCode keeps length and newlines, and lines up after an emoji", () => {
  const src = "const e = `🔴 ${a}` // x.xano.io\nconst b = 1"
  for (const keepStrings of [true, false]) {
    const out = maskNonCode(src, { keepStrings })
    assert.equal(out.length, src.length)
    assert.equal(out.indexOf("\n"), src.indexOf("\n"))
    assert.ok(!out.includes("xano"), "the trailing comment is blanked")
    assert.ok(out.endsWith("const b = 1"))
  }
})

test("maskNonCode keeps an interpolation's closing } only when strings are kept", () => {
  const src = "const u = `https://${sub}.xano.io`"
  assert.equal(maskNonCode(src, { keepStrings: true }), src)
  assert.ok(!maskNonCode(src).includes("}"))
})

for (const [rel, src] of CAUGHT) {
  test(`caught: ${rel}`, () => {
    const hits = xanoEgressHits(rel, maskNonCode(src, { keepStrings: true }))
    assert.ok(hits.length >= 1, `expected a hit for ${rel}: ${src}`)
    assert.ok(scanFile(rel, src).length >= 1)
  })
}

for (const [rel, src] of [...ALLOWED, ...KNOWN_GAPS]) {
  if (rel.startsWith("scripts/")) continue
  test(`not flagged: ${rel}`, () => {
    assert.deepEqual(scanFile(rel, src), [])
  })
}

test("the guard fails on a tree of caught probes and names every file", () => {
  const root = writeRoot(CAUGHT)
  try {
    const r = runGuard(root)
    assert.equal(r.status, 1, r.stdout + r.stderr)
    for (const [rel] of CAUGHT) {
      assert.ok(r.stderr.includes(`${rel}:`), `missing ${rel} in:\n${r.stderr}`)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("the guard passes on a tree of allowed probes and known gaps", () => {
  const root = writeRoot([...ALLOWED, ...KNOWN_GAPS])
  try {
    const r = runGuard(root)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /check:egress-guards ok/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("rule 1 still flags an unscoped mediaPlanVersions select, and a regex before it does not hide it", () => {
  const src = [
    'const re = /["\']/g',
    "export async function f() {",
    "  return db.select().from(schema.mediaPlanVersions)",
    "}",
  ].join("\n")
  const hits = scanFile("lib/x.ts", src)
  assert.equal(hits.length, 1)
  assert.match(hits[0], /^lib\/x\.ts:3 unscoped select\(\)/)
  assert.deepEqual(scanFile("lib/y.ts", src.replace(".from(schema.mediaPlanVersions)", ".from(schema.mediaPlanVersions).where(eq(a, b))")), [])
})
