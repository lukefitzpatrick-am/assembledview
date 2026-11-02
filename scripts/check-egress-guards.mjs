#!/usr/bin/env node
/**
 * Egress guards for plan reads and retired Xano crawls.
 *
 * 1. Empty `db.select()` from `schema.mediaPlanVersions` (or a same-file alias)
 *    with no `.where(` on that chain. A select that passes a column object is
 *    narrowed and passes. One allowlisted reader remains unscoped.
 * 2. No Xano egress in app code (app/, lib/, components/, src/, hooks/,
 *    contexts/, db/, middleware.ts, instrumentation.ts, instrumentation.node.ts,
 *    next.config.mjs; .ts .tsx .js .jsx .mjs .cjs .mts .cts; tests excluded).
 *    No allowlist. (B6, DEAD-14:
 *    the old call-name list and its cold-branch allowlist named helpers and
 *    files that no longer exist.) Caught, case-insensitive:
 *    - a Xano host: `<sub>.xano.io`, `${sub}.xano.io`, a URL whose host is
 *      xano.io or ends in .xano.io, or a string that starts with ".xano.io"
 *      (a host suffix being concatenated on);
 *    - an `XANO_*` or `NEXT_PUBLIC_XANO_*` env read through `process.env` or
 *      `process["env"]`: `.X`, `?.X`, `["X..."]`, `?.["X..."]`,
 *      `const { X } = process.env`, `const { env: { X } } = process`;
 *    - the same through a cast or non-null env object (B8 review 4):
 *      `(process.env as any).X`, `(process.env as T)["X"]`, `process.env!.X`;
 *    - the same through `global.process` or `globalThis.process`, or a
 *      same-file alias of the process object (`const p = process`, then
 *      `p.env.X`);
 *    - the same through a same-file alias of the env object: `const env =
 *      process.env` (also typed, `const env: NodeJS.ProcessEnv = ...`, or
 *      assigned later, `env = process.env`), `const { a, ...rest } =
 *      process.env`, a spread copy (`const env = { ...process.env }`), or
 *      `const { env } = process` / `const { env: e } = process`; then
 *      `env.X`, `env["X"]` or `const { X } = env`;
 *    - B10 (B8 review notes, finding 3): the process module imported or
 *      required: `import { env } from "process"` (or "node:process", or
 *      `{ env as e }`), `import p from "process"`, `import * as p from
 *      "node:process"`, `require("process")` used directly, aliased or
 *      destructured; `globalThis["process"]`; a parenthesised process object
 *      `(process).env` or `(p).env`; `((process.env))`, `(<any>process.env)`
 *      and `(process.env satisfies T)`; `({ ...process.env })`; and an
 *      empty-object default, `const { env = {} } = process`.
 *    Not caught (no current code does this; review catches it): a host split
 *    across strings ("x.xano" + ".io", [..].join(".")), an alias made in
 *    another file or passed through a function, an alias of an alias
 *    (`const b = a`), a copy made with `Object.assign`, a key held in a
 *    variable or passed to a helper (`process.env[k]`), `import.meta.env`, a
 *    dynamic `await import("process")`, and `require` with a computed
 *    specifier (`require(name)`).
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
export const SCAN_DIRS = ["app", "lib", "components", "src", "hooks", "contexts", "db"]
export const SCAN_FILES = ["middleware.ts", "instrumentation.ts", "instrumentation.node.ts", "next.config.mjs"]
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"])

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
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(p)
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

const XANO_ENV_NAME = String.raw`(?:NEXT_PUBLIC_)?XANO_[A-Za-z0-9_]*`
const IDENT = String.raw`[A-Za-z_$][\w$]*`
/**
 * The process object: `process`, `global.process` or `globalThis.process` (B8
 * review 4), `globalThis["process"]`, or `require("process")` /
 * `require("node:process")` (B10). One pair of parentheses may wrap it:
 * `(process).env` (B10).
 */
const PROCESS_CORE = String.raw`(?:(?:global|globalThis)\s*(?:\??\.\s*process|(?:\?\.\s*)?\[\s*["'\`]process["'\`]\s*\])|\brequire\s*\(\s*["'\`](?:node:)?process["'\`]\s*\)|process)`
const PROCESS_OBJ = String.raw`(?:\(\s*${PROCESS_CORE}\s*\)|${PROCESS_CORE})`
/** A module specifier for the process module: "process" or "node:process" (B10). */
const PROCESS_MODULE = String.raw`["'\`](?:node:)?process["'\`]`
/** Not followed by a member access: the whole object, not one of its members. */
const WHOLE = String.raw`(?![\w$]|\s*(?:\?\.|\.|\[))`
/** `name = ` or a typed `name: T = ` (B8 review 4: `const env: NodeJS.ProcessEnv = process.env`). */
const BINDS = String.raw`(?<![\w$.])(${IDENT})\s*(?::\s*[^=;\n]+?)?\s*=(?![=>])\s*`

function escIdent(name) {
  return name.replace(/\$/g, "\\$")
}

function regexAlt(names) {
  return names.map((n) => String.raw`(?<![\w$.])${escIdent(n)}`).join("|")
}

/**
 * Regex sources for the process object (`process`, `global.process`,
 * `globalThis.process` or a same-file alias of one) and for its env object,
 * bare, cast or non-null asserted.
 */
function envObjectSources(processAliases) {
  const proc = processAliases.length
    ? String.raw`(?:${PROCESS_OBJ}|\(\s*(?:${regexAlt(processAliases)})\s*\)|${regexAlt(processAliases)})`
    : PROCESS_OBJ
  const envObj = String.raw`${proc}\s*(?:\??\.\s*env|(?:\?\.\s*)?\[\s*["'\`]env["'\`]\s*\])`
  // `(process.env as any)`, `(process.env!)`, then an optional `!`: `process.env!.X` (B8 review 4).
  // B10: also `(process.env satisfies T)`, an angle cast `(<any>process.env)` and
  // a doubled pair `((process.env))`.
  const inner = String.raw`(?:\(\s*${envObj}\s*!?\s*\)|${envObj})`
  const envExpr = String.raw`(?:\(\s*(?:<[^<>()]*>\s*)?${inner}\s*!?\s*(?:(?:as|satisfies)\s+[^()]*?)?\)|${envObj})\s*!?`
  return { proc, envExpr }
}

/**
 * B10: names bound by an import from "process" or "node:process".
 * `import p from`, `import * as p from` give a process alias; `import { env }`
 * or `import { env as e }` give an env alias.
 */
function processImportAliases(src) {
  const processAliases = []
  const envAliases = []
  const re = new RegExp(String.raw`\bimport\s+([^;"'\`]*?)\s*\bfrom\s*${PROCESS_MODULE}`, "g")
  let m
  while ((m = re.exec(src))) {
    const clause = m[1].replace(/^type\s+/, "")
    const ns = new RegExp(String.raw`\*\s*as\s+(${IDENT})`).exec(clause)
    if (ns) processAliases.push(ns[1])
    const def = new RegExp(String.raw`^\s*(${IDENT})\s*(?:,|$)`).exec(clause)
    if (def) processAliases.push(def[1])
    const named = /\{([^}]*)\}/.exec(clause)
    if (named) {
      for (const part of named[1].split(",")) {
        const entry = new RegExp(String.raw`^\s*env\s*(?:as\s+(${IDENT})\s*)?$`).exec(part)
        if (entry) envAliases.push(entry[1] ?? "env")
      }
    }
  }
  return { processAliases, envAliases }
}

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

  // Same-file aliases of `process` (B8 review 4): `const p = process`,
  // `const p = global.process`, `p = globalThis.process`, then `p.env.XANO_X`.
  // B10: also `const p = require("process")` (through PROCESS_OBJ) and
  // `import p from "process"` / `import * as p from "node:process"`.
  const imported = processImportAliases(src)
  const processAliases = new Set(imported.processAliases)
  const processAliasRe = new RegExp(String.raw`${BINDS}\(?\s*${PROCESS_OBJ}\s*\)?${WHOLE}`, "g")
  while ((m = processAliasRe.exec(src))) processAliases.add(m[1])
  const { proc, envExpr } = envObjectSources([...processAliases])

  // Same-file aliases of the env object (B7 review, widened in B8 review 4).
  // B10: `import { env } from "process"` and `import { env as e } from "node:process"`.
  const aliases = new Set(imported.envAliases)
  const aliasRes = [
    // `const env = process.env`, `let e = process["env"]`, `env = process.env` (a later
    // assignment), `const env: NodeJS.ProcessEnv = process.env`,
    // `const env = process.env as Record<string, string>`, `const env = (process.env as any)`.
    new RegExp(String.raw`${BINDS}${envExpr}${WHOLE}`, "g"),
    // `const { a, ...rest } = process.env`
    new RegExp(String.raw`\.\.\.\s*(${IDENT})\s*\}\s*=\s*${envExpr}${WHOLE}`, "g"),
    // A spread copy: `const env = { ...process.env }`, `{ A: 1, ...process.env }`,
    // or wrapped in parentheses, `const env = ({ ...process.env })` (B10).
    new RegExp(String.raw`${BINDS}\(?\s*\{[^{}]*\.\.\.\s*${envExpr}${WHOLE}`, "g"),
  ]
  for (const re of aliasRes) {
    while ((m = re.exec(src))) aliases.add(m[1])
  }
  // `const { env } = process` and `const { argv, env: e } = global.process`.
  // B10: an empty-object default, `const { env = {} } = process`, and
  // `const { env } = require("process")` (through PROCESS_OBJ).
  const procDestructureRe = new RegExp(String.raw`\{((?:[^{}]|\{\s*\})*)\}\s*=\s*${proc}${WHOLE}`, "g")
  while ((m = procDestructureRe.exec(src))) {
    for (const part of m[1].split(",")) {
      const entry = /^\s*env\s*(?::\s*([A-Za-z_$][\w$]*)\s*)?(?:=[^,]*)?$/.exec(part)
      if (entry) aliases.add(entry[1] ?? "env")
    }
  }

  const envSources = [envExpr]
  if (aliases.size) envSources.push(String.raw`(?:${regexAlt([...aliases])})\s*!?`)
  const envRes = []
  for (const obj of envSources) {
    envRes.push(
      // process.env.XANO_X / process.env?.XANO_X / process["env"].XANO_X / env.XANO_X
      new RegExp(String.raw`(?:${obj})\s*\??\.\s*${XANO_ENV_NAME}`, "gi"),
      // process.env["XANO_X"] / process.env?.["XANO_X"] / process.env[`XANO_${k}`]
      new RegExp(String.raw`(?:${obj})\s*(?:\?\.\s*)?\[\s*["'\`]${XANO_ENV_NAME}`, "gi"),
      // const { XANO_X } = process.env / const { XANO_X } = env
      new RegExp(String.raw`\{[^}]*\b${XANO_ENV_NAME}[^}]*\}\s*=\s*(?:${obj})${WHOLE}`, "gi"),
    )
  }
  // const { env: { XANO_X } } = process  (B7 review; any process form, B8 review 4)
  envRes.push(
    // B10: ends on WHOLE, not `\b`, so `= require("process")` and `= (process)` count.
    new RegExp(String.raw`\{[^{}]*\benv\s*:\s*\{[^}]*\b${XANO_ENV_NAME}[^}]*\}[^{}]*\}\s*=\s*${proc}${WHOLE}`, "gi"),
  )
  const seen = new Set()
  for (const envRe of envRes) {
    while ((m = envRe.exec(src))) {
      const name = /(?:NEXT_PUBLIC_)?XANO_[A-Za-z0-9_]*/i.exec(m[0])?.[0] ?? "XANO_*"
      const hit = `${rel}:${lineAt(src, m.index)} reads env ${name}`
      if (seen.has(hit)) continue
      seen.add(hit)
      hits.push(hit)
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
