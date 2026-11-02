#!/usr/bin/env node
/**
 * Egress guards for plan reads and retired Xano crawls.
 *
 * 1. Empty `db.select()` from `schema.mediaPlanVersions` (or a same-file alias)
 *    with no `.where(` on that chain. A select that passes a column object is
 *    narrowed and passes. One allowlisted reader remains unscoped.
 * 2. No Xano egress in app code (app/, lib/, components/, src/, hooks/,
 *    contexts/, middleware.ts; tests excluded). No allowlist. (B6, DEAD-14:
 *    the old call-name list and its cold-branch allowlist named helpers and
 *    files that no longer exist.) Caught, case-insensitive:
 *    - a Xano host: `<sub>.xano.io`, `${sub}.xano.io`, a URL whose host is
 *      xano.io or ends in .xano.io, or a string that starts with ".xano.io"
 *      (a host suffix being concatenated on);
 *    - an `XANO_*` or `NEXT_PUBLIC_XANO_*` env read through `process.env` or
 *      `process["env"]`: `.X`, `?.X`, `["X..."]`, `?.["X..."]`, and
 *      `const { X } = process.env`.
 *    Not caught (no current code does this; review catches it): a host split
 *    across strings ("x.xano" + ".io", [..].join(".")), an env object alias
 *    (`const env = process.env; env.XANO_X`), a key held in a variable or
 *    passed to a helper (`process.env[k]`), and `import.meta.env`.
 *    A bare "xano.io" string (no leading dot) used to recognise old stored
 *    vault URLs is not a host and is not flagged; neither is "notxano.io".
 *
 * Frozen names this check does not flag (do not rename them):
 *   MART.XANO_LINE_ITEMS_SNAPSHOT
 *   /api/cron/xano-line-item-sync
 *
 * Self-test: `npm run test:egress-guards` (scripts/__tests__/check-egress-guards.test.mjs).
 * `--root <dir>` scans another tree (the self-test uses it on fixture probes).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const SCAN_DIRS = ["app", "lib", "components", "src", "hooks", "contexts"]
export const SCAN_FILES = ["middleware.ts"]
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
 * Blank comments and (unless keepStrings) string and regex-literal contents.
 * Keep indexes and newlines. `${}` stays code; with keepStrings its closing
 * `}` is kept too, so `${sub}.xano.io` reads as one host.
 *
 * Regex literals: a `/` starts one only after an operator or punctuator
 * (`( , = : [ ! & | ? { ; + - * % ~ ^`), a keyword such as `return`, or at
 * the start of the file, and only when a closing `/` follows on the same line.
 * Otherwise it is division. `<`, `>` and `}` are not starters, so JSX
 * (`</div>`, `{a}/{b}`) reads as before. This is a heuristic, not a parser: a regex right
 * after `)` or `]` (`if (x) /re/.test(y)`) reads as division, and a `'` in
 * JSX text still opens a string (both limits pre-date this and no current
 * code trips them).
 */
const REGEX_PREV_PUNCT = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", ";", "+", "-", "*", "%", "~", "^"])
const REGEX_PREV_WORDS = new Set([
  "return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "delete", "instanceof", "new", "throw",
])

export function maskNonCode(src, { keepStrings = false } = {}) {
  // UTF-16 units, so out[i] lines up with src[i] (Array.from splits code points
  // and drifted after an emoji).
  const out = src.split("")
  let i = 0
  const n = src.length

  function blank(at) {
    out[at] = src[at] === "\n" ? "\n" : " "
  }
  function blankStr(at) {
    if (!keepStrings) blank(at)
  }

  // Last significant code char (comments skipped); a string, template or
  // regex just ended counts as an operand, so a `/` after it is division.
  let lastCode = -1
  let lastWasLiteral = false
  function noteCode(at) {
    if (/\s/.test(src[at])) return
    lastCode = at
    lastWasLiteral = false
  }
  function noteLiteral() {
    lastWasLiteral = true
  }

  function regexMayStart() {
    if (lastWasLiteral) return false
    if (lastCode < 0) return true
    const p = src[lastCode]
    if (REGEX_PREV_PUNCT.has(p)) return true
    if (!/[A-Za-z0-9_$]/.test(p)) return false
    let k = lastCode
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--
    return REGEX_PREV_WORDS.has(src.slice(k + 1, lastCode + 1))
  }

  /** Index of the closing `/` of a regex literal starting at `at`, or -1. */
  function regexEnd(at) {
    let j = at + 1
    let inClass = false
    if (src[j] === "/" || src[j] === "*") return -1
    while (j < n) {
      const ch = src[j]
      if (ch === "\n" || ch === "\r") return -1
      if (ch === "\\") {
        j += 2
        continue
      }
      if (inClass) {
        if (ch === "]") inClass = false
      } else if (ch === "[") inClass = true
      else if (ch === "/") return j
      j++
    }
    return -1
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
      if (c === "/" && next !== "/" && next !== "*" && regexMayStart()) {
        const end = regexEnd(i)
        if (end > 0) {
          for (let k = i; k <= end; k++) blankStr(k)
          i = end + 1
          // flags
          while (i < n && /[A-Za-z]/.test(src[i])) i++
          noteLiteral()
          continue
        }
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
        noteLiteral()
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
            noteCode(i + 1)
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
        noteLiteral()
        continue
      }
      if (inInterpolation && c === "{") {
        brace++
        noteCode(i)
        i++
        continue
      }
      if (inInterpolation && c === "}") {
        if (brace === 0) {
          blankStr(i)
          i++
          return
        }
        brace--
        noteCode(i)
        i++
        continue
      }
      noteCode(i)
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

const ENV_OBJ = String.raw`process\s*(?:\.\s*env|\[\s*["'\`]env["'\`]\s*\])`
const XANO_ENV_NAME = String.raw`(?:NEXT_PUBLIC_)?XANO_[A-Za-z0-9_]*`

/** Rule 2 on comment-free source with strings kept. */
export function xanoEgressHits(rel, src) {
  const hits = []
  const hostRe = new RegExp(
    String.raw`(?:(?:[A-Za-z0-9-]+|\$\{[^}\n]*\})\.xano\.io\b|:\/\/(?:[^\s'"\`/]*\.)?xano\.io\b|["'\`]\.xano\.io\b)`,
    "gi",
  )
  let m
  while ((m = hostRe.exec(src))) {
    hits.push(`${rel}:${lineAt(src, m.index)} hardcoded Xano host ${m[0]}`)
  }
  const envRes = [
    // process.env.XANO_X / process.env?.XANO_X / process["env"].XANO_X
    new RegExp(String.raw`${ENV_OBJ}\s*\??\.\s*${XANO_ENV_NAME}`, "gi"),
    // process.env["XANO_X"] / process.env?.["XANO_X"] / process.env[`XANO_${k}`]
    new RegExp(String.raw`${ENV_OBJ}\s*(?:\?\.\s*)?\[\s*["'\`]${XANO_ENV_NAME}`, "gi"),
    // const { XANO_X } = process.env
    new RegExp(String.raw`\{[^}]*\b${XANO_ENV_NAME}[^}]*\}\s*=\s*${ENV_OBJ}`, "gi"),
  ]
  for (const envRe of envRes) {
    while ((m = envRe.exec(src))) {
      const name = /(?:NEXT_PUBLIC_)?XANO_[A-Za-z0-9_]*/i.exec(m[0])?.[0] ?? "XANO_*"
      hits.push(`${rel}:${lineAt(src, m.index)} reads env ${name}`)
    }
  }
  return hits
}

export function scanFile(rel, raw) {
  const hits = []
  hits.push(...unscopedVersionHits(rel, maskNonCode(raw)))
  if (!isTestPath(rel)) hits.push(...xanoEgressHits(rel, maskNonCode(raw, { keepStrings: true })))
  return hits
}

export function scanRoot(rootDir) {
  const files = []
  for (const dir of SCAN_DIRS) {
    const abs = path.join(rootDir, dir)
    if (fs.existsSync(abs)) walk(abs, files)
  }
  for (const file of SCAN_FILES) {
    const abs = path.join(rootDir, file)
    if (fs.existsSync(abs)) files.push(abs)
  }
  const hits = []
  for (const file of files) {
    const rel = posix(path.relative(rootDir, file))
    hits.push(...scanFile(rel, fs.readFileSync(file, "utf8")))
  }
  return hits
}

function main(argv) {
  const at = argv.indexOf("--root")
  const rootDir = at >= 0 && argv[at + 1] ? path.resolve(argv[at + 1]) : defaultRootDir
  const hits = scanRoot(rootDir)
  if (hits.length) {
    console.error("egress guards failed:\n")
    for (const hit of hits) console.error(hit)
    console.error(`\n${hits.length} hit(s).`)
    process.exit(1)
  }
  console.log("check:egress-guards ok")
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
}
