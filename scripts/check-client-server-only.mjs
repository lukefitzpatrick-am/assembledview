#!/usr/bin/env node
/**
 * Fail if a "use client" module can reach `@/db` or `import "server-only"`
 * via static OR dynamic import.
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

function hasUseClient(src) {
  return /^[ \t]*['"]use client['"]/m.test(src.slice(0, 1500))
}

function hasServerOnly(src) {
  return /\bimport\s+['"]server-only['"]/.test(src)
}

function tryResolve(fromFile, spec) {
  if (spec.startsWith("node:")) return null
  if (spec === "server-only") return path.join(rootDir, "__server-only__")
  let abs
  if (spec.startsWith("@/")) abs = path.join(rootDir, spec.slice(2))
  else if (spec.startsWith(".")) abs = path.resolve(path.dirname(fromFile), spec)
  else return null
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
  return path.relative(rootDir, file).replaceAll("\\", "/")
}

function isDbIndex(file) {
  const rel = posixRel(file)
  return rel === "db/index.ts" || rel === "db/index.js"
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
}

function analyze() {
  const files = walkFiles(rootDir)
  const srcByFile = new Map()
  const serverOnlyFiles = new Set()
  const seeds = []

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8")
    srcByFile.set(file, src)
    if (hasServerOnly(src)) serverOnlyFiles.add(file)
    if (hasUseClient(src)) seeds.push(file)
  }

  const edges = new Map()
  const allowlistHits = []

  for (const file of files) {
    const src = srcByFile.get(file)
    const stripped = stripCommentsPreserveStrings(src)
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
        const forbiddenTarget =
          serverOnlyFiles.has(resolved) ||
          isDbIndex(resolved) ||
          resolved === path.join(rootDir, "__server-only__")
        if (forbiddenTarget && !WEBPACK_IGNORE_ALLOWLIST.has(allowKey)) {
          list.push({ to: resolved, kind, spec })
        }
        if (forbiddenTarget && WEBPACK_IGNORE_ALLOWLIST.has(allowKey)) {
          allowlistHits.push(allowKey)
        }
        continue
      }
      if (
        !srcByFile.has(resolved) &&
        !isDbIndex(resolved) &&
        resolved !== path.join(rootDir, "__server-only__")
      ) {
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
    const forbidden =
      serverOnlyFiles.has(file) ||
      isDbIndex(file) ||
      file === path.join(rootDir, "__server-only__")
    if (!forbidden) continue
    hits.push({
      file,
      reason: isDbIndex(file)
        ? "db/index.ts"
        : hasServerOnly(srcByFile.get(file) || "")
          ? 'import "server-only"'
          : "server-only",
      steps: chainFor(file),
    })
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
    "Client graph reaches @/db or import \"server-only\". " +
      "Dynamic import() still bundles — split a *.server.ts sibling " +
      "(avaColumnMapping.server.ts / lineAudit.server.ts).\n\n" +
      formatHits(hits, kindTo),
  )
  process.exit(1)
}

console.log(
  'OK: no client-reachable path to @/db or import "server-only" (static or dynamic).',
)
