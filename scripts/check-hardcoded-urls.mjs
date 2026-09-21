#!/usr/bin/env node
/**
 * Fail when a hard-coded http(s) URL literal appears outside the allowlist.
 *
 * Allowed:
 *   - lib/config/endpoints.ts (the single source of defaults)
 *   - test / __tests__ / *.test.* / *.spec.*
 *   - comments
 *   - href="..." docs links
 *   - placeholder="..." attributes
 *   - xmlns="http://www.w3.org/..."
 *   - dynamic-host templates (`https://${…}`)
 *   - scheme-only strings used for startsWith / normalisation (`"https://"`)
 *   - Auth0 claim-namespace URIs (assembledview.com(.au)/(roles|client…))
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const SCAN_DIRS = ["app", "lib", "components", "scripts"]
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "__tests__",
])

const ENDPOINTS_REL = path.join("lib", "config", "endpoints.ts")

const URL_IN_LITERAL = /https?:\/\/[^\s`'"]+/g

const AUTH0_CLAIM_NS =
  /^https:\/\/assembledview\.com(\.au)?\/(roles|client|client_slug|client_slugs)$/

const DOCS_HOST =
  /(?:docs\.|\/docs\/|auth0\.com\/docs|ga-dev-tools\.google)/i

function isTestPath(rel) {
  if (rel.includes(`${path.sep}__tests__${path.sep}`)) return true
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) return true
  return false
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, out)
      continue
    }
    if (!CODE_EXT.has(path.extname(entry.name))) continue
    out.push(full)
  }
  return out
}

function stripComments(src) {
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
        // template interpolation — copy through ${...} with brace depth
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

function isExemptMatch(match, line) {
  const url = match[0]

  // Dynamic host: https://${...}
  if (/^https?:\/\/\$\{/.test(url)) return true

  // Scheme-only normalisation helpers
  if (url === "http://" || url === "https://") return true

  // xmlns
  if (/xmlns\s*=\s*["']https?:\/\//.test(line)) return true

  // placeholder="…" attributes and placeholder: "…" object fields
  if (/\bplaceholder\s*[:=]\s*\{?["'`][^"'`]*https?:\/\//.test(line)) return true
  if (/\bplaceholder\s*[:=]\s*["'][^"']*https?:\/\//.test(line)) return true

  // href="..." docs links (and any href)
  if (/\bhref\s*=\s*\{?["'`][^"'`]*https?:\/\//.test(line)) return true
  if (/\bhref\s*=\s*["'][^"']*https?:\/\//.test(line)) return true

  // window.open / docs URLs left alone
  if (DOCS_HOST.test(url) || DOCS_HOST.test(line)) return true

  // Auth0 claim namespaces
  if (AUTH0_CLAIM_NS.test(url.replace(/['"`]+$/, ""))) return true

  // Partial scheme prefixes used only in startsWith (e.g. private LAN)
  if (
    /startsWith\s*\(\s*["']https?:\/\/[^"']*["']\s*\)/.test(line) &&
    !/\.[a-z]{2,}(\/|$)/i.test(url)
  ) {
    return true
  }

  if (/startsWith\s*\(\s*["']https?:\/\/["']\s*\)/.test(line)) return true
  if (/\/\^https\?:\\\\\/\\\\\//.test(line)) return true

  return false
}

function scanFile(fullPath) {
  const rel = path.relative(rootDir, fullPath)
  if (rel === ENDPOINTS_REL) return []
  if (rel === path.join("scripts", "check-hardcoded-urls.mjs")) return []
  if (isTestPath(rel)) return []

  const raw = fs.readFileSync(fullPath, "utf8")
  const src = stripComments(raw)
  const lines = src.split(/\r?\n/)
  const hits = []

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo]
    URL_IN_LITERAL.lastIndex = 0
    let m
    while ((m = URL_IN_LITERAL.exec(line)) !== null) {
      if (isExemptMatch(m, line)) continue
      hits.push({ rel, line: lineNo + 1, url: m[0], text: line.trim().slice(0, 160) })
    }
  }
  return hits
}

const files = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(rootDir, dir)
  if (fs.existsSync(abs)) walk(abs, files)
}

const allHits = files.flatMap(scanFile)
if (allHits.length) {
  console.error("Hard-coded URL literals found (use lib/config/endpoints.ts):\n")
  for (const h of allHits) {
    console.error(`  ${h.rel}:${h.line}  ${h.url}`)
    console.error(`    ${h.text}`)
  }
  console.error(`\n${allHits.length} hit(s).`)
  process.exit(1)
}

console.log("check-hardcoded-urls: ok")
