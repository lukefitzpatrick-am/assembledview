#!/usr/bin/env node
/**
 * Egress guards for plan reads and retired Xano crawls.
 *
 * 1. Empty `db.select()` from `schema.mediaPlanVersions` (or a same-file alias)
 *    with no `.where(` on that chain. A select that passes a column object is
 *    narrowed and passes. One allowlisted reader remains unscoped.
 * 2. Runtime calls of `xanoMediaPlansUrl`, `getXanoClientsCollectionUrl`, or
 *    `fetchAllXanoPages` under app/ or lib/. Definitions are not calls.
 *    `fetchAllXanoPagesWithCompleteness` is a different function.
 *    A call is allowed only when its enclosing function is on
 *    `MAIN_ONLY_COLD_XANO_BRANCHES` or `MAIN_ONLY_KNOWN_LIVE_XANO`.
 *    The known-live list is printed as a WARNING on every run.
 *    Any other call fails.
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

const XANO_CALLS = new Set([
  "xanoMediaPlansUrl",
  "getXanoClientsCollectionUrl",
  "fetchAllXanoPages",
])

/** Unscoped full version reads that are still intentional. Rule 1 only — do not add entries. */
const UNSCOPED_VERSION_ALLOWLIST = [
  {
    file: "lib/data/readMediaPlans.ts",
    fn: "fetchPlanVersionsFromPostgres",
    reason:
      "full history for lib/finance/relevantPlanVersions.ts; scoping pending finance decision",
  },
]

function coldXanoReason(flag) {
  return `cold Xano branch behind ${flag}; removed when localhost severance lands on main`
}

/** Rule 2. Flag-gated Xano branches. Not printed. */
const MAIN_ONLY_COLD_XANO_BRANCHES = [
  {
    file: "lib/api/fetchChannelLineItemsByMba.ts",
    fn: "resolveVersionScopeForChannelGet",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/api/replaceChannelLineItems.ts",
    fn: "listExistingRows",
    reason: coldXanoReason("WRITE_BACKEND"),
  },
  {
    file: "lib/api.ts",
    fn: "getMediaPlanVersions",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/data/mirrorToXano.ts",
    fn: "defaultUpsertVersion",
    reason: coldXanoReason("XANO_MIRROR_ENABLED"),
  },
  {
    file: "lib/data/readClients.ts",
    fn: "fetchClientsFromXano",
    reason: coldXanoReason("DATA_BACKEND_CLIENTS"),
  },
  {
    file: "lib/data/readClients.ts",
    fn: "fetchClientByIdFromXano",
    reason: coldXanoReason("DATA_BACKEND_CLIENTS"),
  },
  {
    file: "lib/data/readKpi.ts",
    fn: "fetchCampaignKpisForMbasFromXano",
    reason: coldXanoReason("DATA_BACKEND_KPI"),
  },
  {
    file: "lib/data/readMediaPlans.ts",
    fn: "fetchPlanMastersFromXano",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/data/readMediaPlans.ts",
    fn: "fetchPlanVersionsFromXano",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/data/readMediaPlans.ts",
    fn: "readPlanVersionsByMba",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/data/readMediaPlans.ts",
    fn: "probePlansShadowDiffs",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/data/readPacing.ts",
    fn: "fetchPacingMastersFromXano",
    reason: coldXanoReason("DATA_BACKEND_PACING"),
  },
  {
    file: "lib/data/readPacing.ts",
    fn: "fetchPacingVersionsFromXano",
    reason: coldXanoReason("DATA_BACKEND_PACING"),
  },
  {
    file: "lib/finance/relevantPlanVersions.ts",
    fn: "fetchMastersAndAllVersions",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts",
    fn: "fetchSearchLineItemsForMba",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
  {
    file: "lib/pacing/plans/resolveLivePlanLineItems.ts",
    fn: "fetchXanoLineItemsForMba",
    reason: coldXanoReason("DATA_BACKEND_PLANS"),
  },
]

const KNOWN_LIVE_XANO_REASON =
  "live in production before this push; tracked FX-1; port from localhost"

/** Rule 2. Printed as a WARNING on every run. */
const MAIN_ONLY_KNOWN_LIVE_XANO = [
  {
    file: "app/api/mediaplans/mba/[mba_number]/route.ts",
    fn: "PUT",
    reason: KNOWN_LIVE_XANO_REASON,
  },
  {
    file: "lib/api/fetchChannelLineItemsByMba.ts",
    fn: "fetchXanoTableForEndpoint",
    reason: KNOWN_LIVE_XANO_REASON,
  },
  {
    file: "lib/data/writeClients.ts",
    fn: "mirrorClientToXano",
    reason: KNOWN_LIVE_XANO_REASON,
  },
  {
    file: "lib/finance/forecast/server/loadFinanceForecastDataset.ts",
    fn: "fetchFinanceForecastRawFromXanoUncached",
    reason: KNOWN_LIVE_XANO_REASON,
  },
  {
    file: "lib/finance/xanoReferenceCache.ts",
    fn: "getCachedClients",
    reason: KNOWN_LIVE_XANO_REASON,
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

/** Blank comments and string contents. Keep indexes and newlines. `${}` stays code. */
function maskNonCode(src) {
  const out = Array.from(src)
  let i = 0
  const n = src.length

  function blank(at) {
    out[at] = src[at] === "\n" ? "\n" : " "
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
        blank(i)
        i++
        while (i < n) {
          const ch = src[i]
          if (ch === "\\" && i + 1 < n) {
            blank(i)
            blank(i + 1)
            i += 2
            continue
          }
          blank(i)
          i++
          if (ch === quote) break
        }
        continue
      }
      if (c === "`") {
        blank(i)
        i++
        while (i < n) {
          const ch = src[i]
          if (ch === "\\" && i + 1 < n) {
            blank(i)
            blank(i + 1)
            i += 2
            continue
          }
          if (ch === "$" && src[i + 1] === "{") {
            blank(i)
            blank(i + 1)
            i += 2
            scanCode(true)
            continue
          }
          if (ch === "`") {
            blank(i)
            i++
            break
          }
          blank(i)
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

function isListedXanoCall(rel, fn) {
  return (
    MAIN_ONLY_COLD_XANO_BRANCHES.some((entry) => entry.file === rel && entry.fn === fn) ||
    MAIN_ONLY_KNOWN_LIVE_XANO.some((entry) => entry.file === rel && entry.fn === fn)
  )
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

function xanoCallHits(rel, src) {
  const hits = []
  const ranges = functionRanges(src)
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    if (!XANO_CALLS.has(m[1])) continue
    const before = src.slice(Math.max(0, m.index - 30), m.index)
    if (/\bfunction\s+$/.test(before)) continue
    const fn = enclosingFunction(ranges, m.index)
    if (isListedXanoCall(rel, fn)) continue
    const where = fn ? ` in ${fn}` : ""
    hits.push(`${rel}:${lineAt(src, m.index)} calls ${m[1]}${where}`)
  }
  return hits
}

function printKnownLiveXanoWarning() {
  console.warn("WARNING: known-live Xano calls on main:")
  for (const entry of MAIN_ONLY_KNOWN_LIVE_XANO) {
    console.warn(`  ${entry.file}:${entry.fn} — ${entry.reason}`)
  }
}

const files = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(rootDir, dir)
  if (fs.existsSync(abs)) walk(abs, files)
}

const hits = []
for (const file of files) {
  const rel = posix(path.relative(rootDir, file))
  const masked = maskNonCode(fs.readFileSync(file, "utf8"))
  hits.push(...unscopedVersionHits(rel, masked))
  if (!isTestPath(rel)) hits.push(...xanoCallHits(rel, masked))
}

printKnownLiveXanoWarning()

if (hits.length) {
  console.error("egress guards failed:\n")
  for (const hit of hits) console.error(hit)
  console.error(`\n${hits.length} hit(s).`)
  process.exit(1)
}

console.log("check:egress-guards ok")
