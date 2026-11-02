#!/usr/bin/env node
/**
 * Ratchet inline money maths outside lib/money.
 *
 * Counts hits in .ts and .tsx files, excluding lib/money, tests, scripts, tmp
 * and docs/archive (archived code that never runs; B18, D8).
 * The baseline is scripts/money-inline-baseline.json. A file fails when its
 * count rises or a new file appears. A drop passes.
 *
 * The baseline only goes down (B7, G1):
 *   --update   lowers each file to its current count and drops files at 0.
 *              It never raises a count or adds a file; if any file is over
 *              its baseline it fails like the check does.
 *   --reseed   writes the current counts as they are. Only for the commit
 *              that changes the pattern list below, so the reviewer sees the
 *              pattern change and the new baseline together.
 * Adding debt on purpose means editing the JSON by hand, in review.
 *
 * Patterns:
 *   (100 - or (100- near a fee or pct identifier (fee splits, in components too)
 *   * 100) / 100
 *   Math.round( ... * 100 ... )
 *   <money identifier>.toFixed(2)
 *   / 100 next to a fee identifier
 *   parseFloat( / Number( ... .replace(/[^0-9. or /[^\d. ... ): a local number
 *     parser. Counted for money and counts (TARPs, impressions) alike; lib/money
 *     parseMoney is the money one
 *   percent guessing: a ternary on `<= 1` / `> 1` with a `* 100` branch
 *   local functions named parseMoney, parseAmount, formatCurrency, roundCents,
 *   toCents, roundMoney, roundMoneyCents, parseCurrency, parseMoneySaved,
 *   parseScheduleMoney, toCurrencyNumber, parseDollars, parseBillingScheduleAmount
 *
 * ESLint no-restricted-syntax is not used. Those patterns already match the
 * baseline, so a warn would fire on existing debt on every lint.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// --root <dir> scans another tree with its own scripts/money-inline-baseline.json
// (the self-test, scripts/__tests__/check-money-inline.test.mjs, uses it).
const rootArg = process.argv.indexOf("--root")
const rootDir =
  rootArg >= 0 && process.argv[rootArg + 1]
    ? path.resolve(process.argv[rootArg + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const baselinePath = path.join(rootDir, "scripts", "money-inline-baseline.json")

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  "out",
  "tmp",
])

const MONEY_IDENT =
  /amount|budget|cost|spend|fee|total|gross|net|media/i
const FEE_OR_PCT = /\b\w*(?:fee|pct)\w*\b/i
const FEE_IDENT = /\b\w*fee\w*\b/i
const LOCAL_FN_NAMES = [
  "parseMoney",
  "parseAmount",
  "formatCurrency",
  "roundCents",
  "toCents",
  // B7 (G1)
  "roundMoney",
  "roundMoneyCents",
  "parseCurrency",
  "parseMoneySaved",
  "parseScheduleMoney",
  "toCurrencyNumber",
  "parseDollars",
  "parseBillingScheduleAmount",
].join("|")
const LOCAL_FN = new RegExp(
  String.raw`(?:^|[^\w.])(?:export\s+)?(?:async\s+)?function\s+(${LOCAL_FN_NAMES})\b|(?:^|[^\w.])(?:export\s+)?(?:const|let|var)\s+(${LOCAL_FN_NAMES})\s*=`,
  "g",
)

function toPosix(rel) {
  return rel.split(path.sep).join("/")
}

function isExcluded(relPosix) {
  if (relPosix === "lib/money" || relPosix.startsWith("lib/money/")) return true
  if (relPosix === "scripts" || relPosix.startsWith("scripts/")) return true
  if (relPosix === "docs/archive" || relPosix.startsWith("docs/archive/")) return true
  if (relPosix === "tests" || relPosix.startsWith("tests/")) return true
  if (relPosix.includes("/__tests__/")) return true
  if (/\.(test|spec)\.tsx?$/.test(relPosix)) return true
  return false
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full)
  }
  return out
}

/** Blank comments. Newlines stay so line numbers still match the file. */
function stripComments(src) {
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += " "
        i++
      }
      continue
    }
    if (c === "/" && next === "*") {
      out += "  "
      i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " "
        i++
      }
      if (i < n) {
        out += "  "
        i += 2
      }
      continue
    }
    if (c === "`" || c === '"' || c === "'") {
      const quote = c
      out += c
      i++
      while (i < n) {
        const ch = src[i]
        out += ch
        if (ch === "\\" && quote !== "`") {
          i++
          if (i < n) out += src[i]
          i++
          continue
        }
        if (quote === "`" && ch === "\\" && src[i + 1] === "`") {
          i += 2
          out += "`"
          continue
        }
        if (ch === quote) {
          i++
          break
        }
        if (quote === "`" && ch === "$" && src[i + 1] === "{") {
          out += "{"
          i += 2
          let depth = 1
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++
            else if (src[i] === "}") depth--
            out += src[i]
            i++
          }
          continue
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

function lineStarts(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") starts.push(i + 1)
  }
  return starts
}

function lineAt(starts, index) {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (starts[mid] <= index) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function lineText(rawLines, line) {
  return (rawLines[line - 1] ?? "").trim().slice(0, 200)
}

function hasIdent(text, re) {
  re.lastIndex = 0
  return re.test(text)
}

function scanSource(src) {
  const hits = []
  const starts = lineStarts(src)

  function add(index, kind) {
    let at = index
    while (at < src.length && /\s/.test(src[at])) at++
    hits.push({ line: lineAt(starts, at), kind })
  }

  const hundredMinus = /\(100\s*-/g
  let m
  while ((m = hundredMinus.exec(src)) !== null) {
    const near = src.slice(m.index, m.index + 80).split(/[;\n]/)[0]
    if (hasIdent(near, FEE_OR_PCT)) add(m.index, "(100 - near fee or pct)")
  }

  const timesHundredOver = /\*\s*100\)\s*\/\s*100\b/g
  while ((m = timesHundredOver.exec(src)) !== null) {
    add(m.index, "* 100) / 100")
  }

  const mathRound = /Math\.round\s*\(/g
  while ((m = mathRound.exec(src)) !== null) {
    const open = m.index + m[0].length - 1
    const close = matchingParen(src, open)
    if (close < 0) continue
    const inner = src.slice(open + 1, close)
    if (/\*\s*100\b/.test(inner)) add(m.index, "Math.round with * 100")
    mathRound.lastIndex = close + 1
  }

  const toFixed = /\b([A-Za-z_][\w]*)\.toFixed\(\s*2\s*\)/g
  while ((m = toFixed.exec(src)) !== null) {
    if (MONEY_IDENT.test(m[1])) add(m.index, "money toFixed(2)")
  }

  const div100 = /\/\s*100\b/g
  while ((m = div100.exec(src)) !== null) {
    const from = Math.max(0, m.index - 80)
    const near = src.slice(from, m.index + m[0].length)
    if (hasIdent(near, FEE_IDENT)) add(m.index, "/ 100 next to fee")
  }

  const numberParse = /\b(?:parseFloat|Number)\s*\(/g
  while ((m = numberParse.exec(src)) !== null) {
    const open = m.index + m[0].length - 1
    const close = matchingParen(src, open)
    if (close < 0) continue
    const inner = src.slice(open + 1, close)
    if (/\.replace\s*\(\s*\/\[\^(?:0-9|\\d)/.test(inner)) add(m.index, "local number parser (parseFloat/Number of .replace(/[^0-9.); money or count")
  }

  const pctGuess = /(?:<=?|>=?)\s*1(?:\.0+)?\s*\?[^;\n]{0,80}\*\s*100\b/g
  while ((m = pctGuess.exec(src)) !== null) {
    add(m.index, "percent guessing (<= 1 / > 1 ? ... * 100)")
  }

  LOCAL_FN.lastIndex = 0
  while ((m = LOCAL_FN.exec(src)) !== null) {
    add(m.index, `local function ${m[1] || m[2]}`)
  }

  return hits
}

function matchingParen(src, openIndex) {
  let depth = 0
  let i = openIndex
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"' || c === "`") {
      const quote = c
      i++
      while (i < src.length) {
        if (src[i] === "\\" && quote !== "`") {
          i += 2
          continue
        }
        if (quote === "`" && src[i] === "\\" && src[i + 1] === "`") {
          i += 2
          continue
        }
        if (src[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === "(") depth++
    else if (c === ")") {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

function scanFile(fullPath) {
  const rel = toPosix(path.relative(rootDir, fullPath))
  if (isExcluded(rel)) return { rel, hits: [] }
  const raw = fs.readFileSync(fullPath, "utf8")
  const stripped = stripComments(raw)
  if (stripped.length !== raw.length) {
    throw new Error(`comment strip changed length in ${rel}`)
  }
  const hits = scanSource(stripped)
  const rawLines = raw.split(/\r?\n/)
  return {
    rel,
    hits: hits.map((hit) => ({
      ...hit,
      text: lineText(rawLines, hit.line),
    })),
  }
}

function countsFrom(scans) {
  const counts = {}
  for (const scan of scans) {
    if (scan.hits.length === 0) continue
    counts[scan.rel] = scan.hits.length
  }
  return counts
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return null
  const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("money-inline-baseline.json must be a per-file count object")
  }
  return parsed
}

function writeBaseline(counts) {
  const ordered = {}
  for (const key of Object.keys(counts).sort()) ordered[key] = counts[key]
  fs.writeFileSync(baselinePath, `${JSON.stringify(ordered, null, 2)}\n`)
}

const update = process.argv.includes("--update")
const reseed = process.argv.includes("--reseed")
const files = walk(rootDir)
const scans = files.map(scanFile)
const counts = countsFrom(scans)
const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

if (reseed) {
  writeBaseline(counts)
  console.log(
    `check:money-inline: reseeded baseline (${Object.keys(counts).length} files, ${total} hits). Only with a pattern change. use lib/money`,
  )
  process.exit(0)
}

const baseline = readBaseline()
if (!baseline) {
  console.error("check:money-inline: baseline missing. Run with --reseed once. use lib/money")
  process.exit(1)
}

const failures = []
for (const [rel, count] of Object.entries(counts)) {
  const allowed = baseline[rel]
  if (allowed == null) {
    failures.push({ rel, count, allowed: 0, reason: "new file" })
  } else if (count > allowed) {
    failures.push({ rel, count, allowed, reason: "count went up" })
  }
}

if (failures.length > 0) {
  console.error(
    update
      ? "check:money-inline: --update only lowers the baseline; these files are over it. use lib/money\n"
      : "inline money maths increased. use lib/money\n",
  )
  const byRel = new Map(scans.map((scan) => [scan.rel, scan]))
  for (const failure of failures) {
    console.error(
      `${failure.rel}: ${failure.count} (baseline ${failure.allowed}, ${failure.reason})`,
    )
    const hits = byRel.get(failure.rel)?.hits ?? []
    for (const hit of hits) {
      console.error(`  ${failure.rel}:${hit.line}  ${hit.text}`)
      console.error(`    ${hit.kind}. use lib/money`)
    }
  }
  process.exit(1)
}

let dropped = 0
for (const [rel, allowed] of Object.entries(baseline)) {
  const count = counts[rel] ?? 0
  if (count < allowed) dropped += allowed - count
}
if (update) {
  const lowered = {}
  for (const [rel, allowed] of Object.entries(baseline)) {
    const count = Math.min(counts[rel] ?? 0, allowed)
    if (count > 0) lowered[rel] = count
  }
  writeBaseline(lowered)
  console.log(`check:money-inline: baseline lowered by ${dropped} (${total} hits). use lib/money`)
  process.exit(0)
}
if (dropped > 0) {
  console.log(
    `check:money-inline: ok (${total} hits, ${dropped} under baseline). --update tightens it. use lib/money`,
  )
} else {
  console.log(`check:money-inline: ok (${Object.keys(counts).length} files, ${total} hits)`)
}
