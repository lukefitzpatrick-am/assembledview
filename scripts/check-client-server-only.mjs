#!/usr/bin/env node
/**
 * Fail if a "use client" module can reach a server-only sink via static OR
 * dynamic import. The sinks are:
 *
 *   - `import "server-only"` anywhere in the module
 *   - `db/index.ts` (the Drizzle client)
 *   - the `db/schema` barrel and its table modules — they re-export Drizzle
 *     table builders, so the barrel drags `drizzle-orm/pg-core` into the
 *     browser. `CLIENT_SAFE_DB_SCHEMA` is the escape hatch for plain value
 *     lists the UI legitimately needs (`lineChannelValues.ts`).
 *   - the node packages in `FORBIDDEN_PACKAGES` — `snowflake-sdk`,
 *     `drizzle-orm`, `postgres`, `pg`. These are the ones that actually cost
 *     bundle size and build time, and they are what the `db/*` rules are
 *     protecting against, so they are checked directly as well.
 *
 * `await import("@/db")` defers loading, not bundling — Webpack still puts
 * `db/index.ts` in the client graph. Type-only imports are erased and skipped.
 * `import(/* webpackIgnore: true *\/ …)` is skipped only for the isomorphic
 * `lib/api.ts` allowlist (B-1). Any other webpackIgnore of a server-only
 * module is a hit — split a `*.server.ts` sibling instead.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "tmp",
  "_to_delete",
  ".worktrees",
  ".parked-untracked",
  // Untracked scratch: absent in CI, and a throwaway file with "use client"
  // plus a @/db import would otherwise fail the gate on code nobody ships.
  "av-review",
  ".agents",
  "coverage",
  "scripts",
])

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])

/**
 * Isomorphic `lib/api.ts` reads: webpackIgnore keeps server-only readers out
 * of create/edit client chunks. New rows need a review, not a silent add.
 */
const WEBPACK_IGNORE_ALLOWLIST = new Set([
  "lib/api.ts -> @/lib/data/readMediaPlans",
  "lib/api.ts -> @/lib/data/readReferenceMediaDetail",
  "lib/api.ts -> @/lib/data/readPublishers",
  "lib/api.ts -> @/lib/data/readClients",
])

/**
 * Node packages that must never appear in a client chunk. Subpaths count
 * (`drizzle-orm/pg-core`, `pg/lib/*`). `exceljs` and `pptx-automizer` are
 * deliberately absent — those are client-side generators behind a lazy
 * `import()`, so they are a code-split, not a leak.
 */
const FORBIDDEN_PACKAGES = new Set([
  "snowflake-sdk",
  "drizzle-orm",
  "postgres",
  "pg",
])

/**
 * `db/schema` modules a client component may import. These hold plain values
 * with no drizzle import; everything else in `db/schema` is a table or enum
 * builder. Adding a row here means proving the module imports no drizzle,
 * directly or transitively — the traversal will catch it if you are wrong.
 */
const CLIENT_SAFE_DB_SCHEMA = new Set(["db/schema/lineChannelValues.ts"])

/** Sink node for a bare package specifier, which has no file on disk here. */
function packageNode(name) {
  return `__pkg__:${name}`
}

/** `drizzle-orm/pg-core` -> `drizzle-orm`; `@scope/x/y` -> `@scope/x`. */
function packageRoot(spec) {
  const parts = spec.split("/")
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkFiles(full, out)
      continue
    }
    if (!CODE_EXT.has(path.extname(entry.name))) continue
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
    if (entry.name.endsWith(".d.ts")) continue
    out.push(full)
  }
  return out
}

function stripCommentsPreserveStrings(src) {
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++
      continue
    }
    if (c === "/" && next === "*") {
      i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++
      i += 2
      out += " "
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c
      out += c
      i++
      while (i < n) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "")
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === q) {
          i++
          break
        }
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

function isTypeOnlyImport(clause) {
  const trimmed = clause.trim()
  if (trimmed.startsWith("type ") || trimmed === "type") return true
  const named = trimmed.match(/^\{([\s\S]*)\}$/)
  if (!named) return false
  const inner = named[1].trim()
  if (!inner) return false
  const parts = inner
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return false
  return parts.every((p) => p.startsWith("type ") || p === "type")
}

function collectStaticSpecifiers(stripped) {
  const specs = []
  const re = /\b(?:import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(stripped))) {
    const clause = m[1]
    if (/\bexport\s+type\b/.test(m[0]) || isTypeOnlyImport(clause)) continue
    specs.push({ spec: m[2], kind: "static" })
  }
  const side = /\bimport\s+['"]([^'"]+)['"]/g
  while ((m = side.exec(stripped))) {
    specs.push({ spec: m[1], kind: "static" })
  }
  return specs
}

function collectDynamicSpecifiers(src) {
  const specs = []
  const re = /import\s*\(([\s\S]*?)\)/g
  let m
  while ((m = re.exec(src))) {
    const inner = m[1]
    const lit = inner.match(/['"]([^'"]+)['"]/)
    if (!lit) continue
    if (/webpackIgnore\s*:\s*true/.test(inner)) {
      specs.push({ spec: lit[1], kind: "dynamic-webpackIgnore" })
      continue
    }
    specs.push({ spec: lit[1], kind: "dynamic" })
  }
  const req = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = req.exec(src))) {
    specs.push({ spec: m[1], kind: "require" })
  }
  return specs
}

/**
 * Both of these take comment-stripped source. A file that *documents* the rule
 * ("modules one level up carry `import \"server-only\"`") must not be counted
 * as carrying the marker itself — that misread turned a client-safe module into
 * a sink and failed the gate on its own doc comment.
 */
function hasUseClient(stripped) {
  return /^[ \t]*['"]use client['"]/m.test(stripped.slice(0, 1500))
}

function hasServerOnly(stripped) {
  return /\bimport\s+['"]server-only['"]/.test(stripped)
}

function tryResolve(fromFile, spec) {
  if (spec.startsWith("node:")) return null
  if (spec === "server-only") return path.join(rootDir, "__server-only__")
  let abs
  if (spec.startsWith("@/")) abs = path.join(rootDir, spec.slice(2))
  else if (spec.startsWith(".")) abs = path.resolve(path.dirname(fromFile), spec)
  else {
    const root = packageRoot(spec)
    return FORBIDDEN_PACKAGES.has(root) ? packageNode(root) : null
  }
  abs = path.normalize(abs)
  const candidates = [
    abs,
    abs + ".ts",
    abs + ".tsx",
    abs + ".js",
    abs + ".jsx",
    abs + ".mjs",
    path.join(abs, "index.ts"),
    path.join(abs, "index.tsx"),
    path.join(abs, "index.js"),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return abs
}

function posixRel(file) {
  if (file === path.join(rootDir, "__server-only__")) return "server-only (package)"
  if (file.startsWith("__pkg__:")) return `${file.slice(8)} (package)`
  return path.relative(rootDir, file).replaceAll("\\", "/")
}

function isDbIndex(file) {
  const rel = posixRel(file)
  return rel === "db/index.ts" || rel === "db/index.js"
}

function isDbSchema(file) {
  const rel = posixRel(file)
  if (!rel.startsWith("db/schema/")) return false
  return !CLIENT_SAFE_DB_SCHEMA.has(rel)
}

/** Why this node is a sink, or null when it is ordinary app code. */
function sinkReason(file, serverOnlyFiles) {
  if (file === path.join(rootDir, "__server-only__")) return "server-only"
  if (file.startsWith("__pkg__:")) return `${file.slice(8)} (node package)`
  if (isDbIndex(file)) return "db/index.ts"
  if (isDbSchema(file)) return "db/schema (drizzle table builders)"
  if (serverOnlyFiles.has(file)) return 'import "server-only"'
  return null
}

function selfTest() {
  const dyn = collectDynamicSpecifiers(
    `const { db } = await import("@/db")\nvoid db`,
  )
  assert.deepEqual(
    dyn.map((e) => `${e.kind}:${e.spec}`),
    ["dynamic:@/db"],
    "BUILD-1 form: await import(\"@/db\") must be a dynamic edge",
  )

  const ignored = collectDynamicSpecifiers(
    `await import(\n  /* webpackIgnore: true */ "@/lib/data/readClients"\n)`,
  )
  assert.deepEqual(
    ignored.map((e) => `${e.kind}:${e.spec}`),
    ["dynamic-webpackIgnore:@/lib/data/readClients"],
  )

  const typeOnly = collectStaticSpecifiers(
    stripCommentsPreserveStrings(`import type { Foo } from "@/db"\n`),
  )
  assert.equal(typeOnly.length, 0, "import type must not create an edge")

  const mixed = collectStaticSpecifiers(
    stripCommentsPreserveStrings(
      `import { type Foo, bar } from "./x"\nexport { baz } from "./y"\n`,
    ),
  )
  assert.deepEqual(
    mixed.map((e) => e.spec).sort(),
    ["./x", "./y"],
  )

  const allTypeNamed = collectStaticSpecifiers(
    stripCommentsPreserveStrings(`import { type Foo, type Bar } from "@/db"\n`),
  )
  assert.equal(allTypeNamed.length, 0)

  assert.equal(
    [...WEBPACK_IGNORE_ALLOWLIST].some((k) => k.includes("@/db")),
    false,
    "never allowlist webpackIgnore of @/db — that is the BUILD-1 class",
  )

  // Bare package sinks resolve to a synthetic node; subpaths fold to the root.
  const here = path.join(rootDir, "app/x.tsx")
  assert.equal(tryResolve(here, "drizzle-orm/pg-core"), packageNode("drizzle-orm"))
  assert.equal(tryResolve(here, "snowflake-sdk"), packageNode("snowflake-sdk"))
  assert.equal(tryResolve(here, "postgres"), packageNode("postgres"))
  assert.equal(tryResolve(here, "react"), null, "ordinary packages are not sinks")
  assert.equal(packageRoot("@scope/pkg/deep"), "@scope/pkg")

  const emptyServerOnly = new Set()
  assert.equal(
    sinkReason(path.join(rootDir, "db/schema/enums.ts"), emptyServerOnly),
    "db/schema (drizzle table builders)",
  )
  assert.equal(
    sinkReason(path.join(rootDir, "db/schema/lineChannelValues.ts"), emptyServerOnly),
    null,
    "the plain value tuple is the client-safe escape hatch",
  )
  assert.equal(
    sinkReason(path.join(rootDir, "lib/mediaplan/burstAmounts.ts"), emptyServerOnly),
    null,
  )
  assert.ok(
    CLIENT_SAFE_DB_SCHEMA.size <= 2,
    "client-safe db/schema list must stay tiny — each row needs a review",
  )

  // A doc comment describing the rule is prose, not a marker.
  const documented = stripCommentsPreserveStrings(
    '/** Modules one level up carry `import "server-only"`. */\nexport const a = 1\n',
  )
  assert.equal(hasServerOnly(documented), false)
  assert.equal(
    hasServerOnly(stripCommentsPreserveStrings('import "server-only"\nexport const a = 1\n')),
    true,
  )
  assert.equal(
    hasUseClient(stripCommentsPreserveStrings('// not a "use client" file\nexport const a = 1\n')),
    false,
  )
  assert.equal(
    hasUseClient(stripCommentsPreserveStrings('"use client"\nexport const a = 1\n')),
    true,
  )
}

function analyze() {
  const files = walkFiles(rootDir)
  const srcByFile = new Map()
  const strippedByFile = new Map()
  const serverOnlyFiles = new Set()
  const seeds = []

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8")
    srcByFile.set(file, src)
    const stripped = stripCommentsPreserveStrings(src)
    strippedByFile.set(file, stripped)
    if (hasServerOnly(stripped)) serverOnlyFiles.add(file)
    if (hasUseClient(stripped)) seeds.push(file)
  }

  const edges = new Map()
  const allowlistHits = []

  for (const file of files) {
    const src = srcByFile.get(file)
    const stripped = strippedByFile.get(file)
    const all = [
      ...collectStaticSpecifiers(stripped),
      ...collectDynamicSpecifiers(src),
    ]
    const list = []
    for (const { spec, kind } of all) {
      const resolved = tryResolve(file, spec)
      if (!resolved) continue
      const fromRel = posixRel(file)
      const allowKey = `${fromRel} -> ${spec}`
      if (kind === "dynamic-webpackIgnore") {
        const forbiddenTarget = sinkReason(resolved, serverOnlyFiles) !== null
        if (forbiddenTarget && !WEBPACK_IGNORE_ALLOWLIST.has(allowKey)) {
          list.push({ to: resolved, kind, spec })
        }
        if (forbiddenTarget && WEBPACK_IGNORE_ALLOWLIST.has(allowKey)) {
          allowlistHits.push(allowKey)
        }
        continue
      }
      if (!srcByFile.has(resolved) && !sinkReason(resolved, serverOnlyFiles)) {
        if (spec === "@/db" || spec === "@/db/index" || spec.startsWith("@/db/")) {
          list.push({ to: resolved, kind, spec })
        }
        continue
      }
      list.push({ to: resolved, kind, spec })
    }
    edges.set(file, list)
  }

  const parent = new Map()
  const kindTo = new Map()
  const queue = []
  const seen = new Set()
  for (const seed of seeds) {
    seen.add(seed)
    queue.push(seed)
    parent.set(seed, null)
  }
  while (queue.length) {
    const cur = queue.shift()
    for (const edge of edges.get(cur) || []) {
      if (seen.has(edge.to)) continue
      seen.add(edge.to)
      parent.set(edge.to, cur)
      kindTo.set(edge.to, edge)
      // Stop at a sink. One `db/schema` barrel import would otherwise report
      // every table module and every package behind it as its own hit; the
      // shortest chain to the first sink is what has to be fixed.
      if (sinkReason(edge.to, serverOnlyFiles)) continue
      queue.push(edge.to)
    }
  }

  function chainFor(file) {
    const steps = []
    let cur = file
    while (cur) {
      steps.push(cur)
      cur = parent.get(cur)
    }
    steps.reverse()
    return steps
  }

  const hits = []
  for (const file of seen) {
    const reason = sinkReason(file, serverOnlyFiles)
    if (!reason) continue
    hits.push({ file, reason, steps: chainFor(file) })
  }
  hits.sort((a, b) => posixRel(a.file).localeCompare(posixRel(b.file)))
  return { seeds, serverOnlyFiles, seen, hits, kindTo, allowlistHits }
}

function formatHits(hits, kindTo) {
  const lines = []
  for (const hit of hits) {
    lines.push(`SINK  ${posixRel(hit.file)}  (${hit.reason})`)
    for (let i = 0; i < hit.steps.length; i++) {
      const f = hit.steps[i]
      const edge = kindTo.get(f)
      const mark =
        i === 0
          ? '("use client")'
          : edge
            ? `[${edge.kind} ${edge.spec}]`
            : ""
      lines.push(`  ${i === 0 ? "" : "-> "}${posixRel(f)}  ${mark}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

selfTest()
const { seeds, serverOnlyFiles, seen, hits, kindTo, allowlistHits } = analyze()

console.log(
  `client-server-only: ${seeds.length} use-client seeds, ${serverOnlyFiles.size} server-only modules, ${seen.size} reachable, ${new Set(allowlistHits).size} webpackIgnore allowlist edges`,
)

if (hits.length) {
  console.error(
    "Client graph reaches a server-only sink. Dynamic import() still bundles — " +
      "split a *.server.ts sibling (avaColumnMapping.server.ts / " +
      "lineAudit.server.ts), or for a plain value list from db/schema, move the " +
      "values to their own drizzle-free module (db/schema/lineChannelValues.ts).\n\n" +
      formatHits(hits, kindTo),
  )
  process.exit(1)
}

console.log(
  "OK: no client-reachable path to @/db, db/schema, snowflake-sdk, drizzle-orm, " +
    'postgres, pg or import "server-only" (static or dynamic).',
)
