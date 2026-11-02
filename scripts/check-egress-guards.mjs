#!/usr/bin/env node
/**
 * Egress guards for plan reads and retired Xano crawls.
 *
 * 1. Empty `db.select()` from `schema.mediaPlanVersions` (or a same-file alias)
 *    with no `.where(` on that chain. A select that passes a column object is
 *    narrowed and passes. One allowlisted reader remains unscoped.
 * 2. No Xano egress under app/ or lib/ (tests excluded): no hardcoded Xano
 *    host (`<sub>.xano.io`, or a URL whose host ends in xano.io) and no
 *    `XANO_*` env read (`process.env.XANO_*` / `process.env["XANO_*"]`).
 *    No allowlist. (B6, DEAD-14: the old call-name list and its
 *    cold-branch allowlist named helpers and files that no longer exist.)
 *    A bare "xano.io" string used to recognise old stored vault URLs is not
 *    a host and is not flagged.
 *
 * Frozen names this check does not flag (do not rename them):
 *   MART.XANO_LINE_ITEMS_SNAPSHOT
 *   /api/cron/xano-line-item-sync
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SCAN_DIRS = ["app", "lib"]
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])

/** Unscoped full version reads that are still intentional. Rule 1 only — do not add entries. */
const UNSCOPED_VERSION_ALLOWLIST = [
  {
    file: "lib/data/readMediaPlans.ts",
    fn: "fetchPlanVersionsFromPostgres",
    reason:
      "full history for lib/finance/relevantPlanVersions.ts; scoping pending finance decision",
  },
]

function posix(rel) {
  return rel.split(path.sep).join("/")
}

function isTestPath(rel) {
  const p = posix(rel)
  if (p.includes("/__tests__/")) return true
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(p)
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!CODE_EXT.has(path.extname(entry.name))) continue
    out.push(full)
  }
  return out
}

/**
 * Blank comments and (unless keepStrings) string contents. Keep indexes and
 * newlines. `${}` stays code.
 */
function maskNonCode(src, { keepStrings = false } = {}) {
  const out = Array.from(src)
  let i = 0
  const n = src.length

  function blank(at) {
    out[at] = src[at] === "\n" ? "\n" : " "
  }
  function blankStr(at) {
    if (!keepStrings) blank(at)
  }

  function scanCode(inInterpolation) {
    let brace = 0
    while (i < n) {
      const c = src[i]
      const next = src[i + 1]
      if (c === "/" && next === "/") {
        while (i < n && src[i] !== "\n") {
          blank(i)
          i++
        }
        continue
      }
      if (c === "/" && next === "*") {
        blank(i)
        blank(i + 1)
        i += 2
        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
          blank(i)
          i++
        }
        if (i < n) {
          blank(i)
          blank(i + 1)
          i += 2
        }
        continue
      }
      if (c === "'" || c === '"') {
        const quote = c
        blankStr(i)
        i++
        while (i < n) {
          const ch = src[i]
          if (ch === "\\" && i + 1 < n) {
            blankStr(i)
            blankStr(i + 1)
            i += 2
            continue
          }
          blankStr(i)
          i++
          if (ch === quote) break
        }
        continue
      }
      if (c === "`") {
        blankStr(i)
        i++
        while (i < n) {
          const ch = src[i]
          if (ch === "\\" && i + 1 < n) {
            blankStr(i)
            blankStr(i + 1)
            i += 2
            continue
          }
          if (ch === "$" && src[i + 1] === "{") {
            blankStr(i)
            blankStr(i + 1)
            i += 2
            scanCode(true)
            continue
          }
          if (ch === "`") {
            blankStr(i)
            i++
            break
          }
          blankStr(i)
          i++
        }
        continue
      }
      if (inInterpolation && c === "{") {
        brace++
        i++
        continue
      }
      if (inInterpolation && c === "}") {
        if (brace === 0) {
          blank(i)
          i++
          return
        }
        brace--
        i++
        continue
      }
      i++
    }
  }

  scanCode(false)
  return out.join("")
}

function matchCloser(src, openIndex, openChar, closeChar) {
  let depth = 0
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i]
    if (c === openChar) depth++
    else if (c === closeChar) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function lineAt(src, index) {
  let line = 1
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === "\n") line++
  }
  return line
}

function skipWs(src, index) {
  let i = index
  while (i < src.length && /\s/.test(src[i])) i++
  return i
}

function functionRanges(src) {
  const ranges = []
  const re = /\b(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const paren = src.indexOf("(", m.index + m[0].length - 1)
    const close = matchCloser(src, paren, "(", ")")
    if (close < 0) continue
    let i = close + 1
    let angle = 0
    let parenDepth = 0
    let bracket = 0
    while (i < src.length) {
      const c = src[i]
      if (c === "(") parenDepth++
      else if (c === ")") parenDepth--
      else if (c === "[") bracket++
      else if (c === "]") bracket--
      else if (c === "<") angle++
      else if (c === ">") angle--
      else if (c === "{" && parenDepth === 0 && bracket === 0 && angle === 0) break
      else if (c === ";" && parenDepth === 0 && bracket === 0 && angle === 0) {
        i = -1
        break
      }
      i++
    }
    if (i < 0 || src[i] !== "{") continue
    const end = matchCloser(src, i, "{", "}")
    if (end < 0) continue
    ranges.push({ name: m[1], start: m.index, end })
  }
  return ranges
}

function enclosingFunction(ranges, index) {
  let best = null
  for (const range of ranges) {
    if (index < range.start || index > range.end) continue
    if (!best || range.end - range.start < best.end - best.start) best = range
  }
  return best?.name ?? null
}

function versionAliases(src) {
  const names = new Set()
  const re = /\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*schema\.mediaPlanVersions\b/g
  let m
  while ((m = re.exec(src))) names.add(m[1])
  return names
}

function fromTargetsVersions(inner, aliases) {
  if (/\bschema\.mediaPlanVersions\b/.test(inner)) return true
  for (const alias of aliases) {
    if (new RegExp(`\\b${alias}\\b`).test(inner)) return true
  }
  return false
}

function chainHasWhere(src, fromClose) {
  let i = fromClose + 1
  while (i < src.length) {
    i = skipWs(src, i)
    if (src[i] !== ".") return false
    const m = /^\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(src.slice(i))
    if (!m) return false
    if (m[1] === "where") return true
    const open = i + m[0].length - 1
    const close = matchCloser(src, open, "(", ")")
    if (close < 0) return false
    i = close + 1
  }
  return false
}

function isAllowlisted(rel, fn) {
  return UNSCOPED_VERSION_ALLOWLIST.some((entry) => entry.file === rel && entry.fn === fn)
}

function unscopedVersionHits(rel, src) {
  const hits = []
  const aliases = versionAliases(src)
  const ranges = functionRanges(src)
  const re = /\.select\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const open = src.indexOf("(", m.index)
    const close = matchCloser(src, open, "(", ")")
    if (close < 0) continue
    if (src.slice(open + 1, close).trim() !== "") continue
    const afterSelect = skipWs(src, close + 1)
    const fromMatch = /^\.from\s*\(/.exec(src.slice(afterSelect))
    if (!fromMatch) continue
    const fromOpen = afterSelect + fromMatch[0].length - 1
    const fromClose = matchCloser(src, fromOpen, "(", ")")
    if (fromClose < 0) continue
    const inner = src.slice(fromOpen + 1, fromClose)
    if (!fromTargetsVersions(inner, aliases)) continue
    if (chainHasWhere(src, fromClose)) continue
    const fn = enclosingFunction(ranges, m.index)
    if (isAllowlisted(rel, fn)) continue
    hits.push(`${rel}:${lineAt(src, m.index)} unscoped select() from schema.mediaPlanVersions`)
  }
  return hits
}

/** Rule 2 on comment-free source with strings kept. */
function xanoEgressHits(rel, src) {
  const hits = []
  const hostRe = /(?:[A-Za-z0-9-]+\.xano\.io\b|:\/\/[^\s'"`/]*xano\.io\b)/g
  let m
  while ((m = hostRe.exec(src))) {
    hits.push(`${rel}:${lineAt(src, m.index)} hardcoded Xano host ${m[0]}`)
  }
  const envRe = /process\.env(?:\.XANO_[A-Za-z0-9_]*|\[\s*["'`]XANO_[A-Za-z0-9_]*)/g
  while ((m = envRe.exec(src))) {
    hits.push(`${rel}:${lineAt(src, m.index)} reads ${m[0].replace(/\[\s*["'`]/, ".")}`)
  }
  return hits
}

const files = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(rootDir, dir)
  if (fs.existsSync(abs)) walk(abs, files)
}

const hits = []
for (const file of files) {
  const rel = posix(path.relative(rootDir, file))
  const raw = fs.readFileSync(file, "utf8")
  hits.push(...unscopedVersionHits(rel, maskNonCode(raw)))
  if (!isTestPath(rel)) hits.push(...xanoEgressHits(rel, maskNonCode(raw, { keepStrings: true })))
}

if (hits.length) {
  console.error("egress guards failed:\n")
  for (const hit of hits) console.error(hit)
  console.error(`\n${hits.length} hit(s).`)
  process.exit(1)
}

console.log("check:egress-guards ok")
