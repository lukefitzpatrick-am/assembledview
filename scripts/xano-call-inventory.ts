/**
 * S0-P3: Static inventory of Xano calls in app/ + lib/.
 *
 * Scans for fetch/axios whose URL is built from XANO_*_BASE_URL (via
 * xanoUrl / getXanoBaseUrl / process.env.XANO_*_BASE_URL) and emits
 * xano-call-inventory.json with cross-refs against xano-apigroups-endpoints.json.
 *
 * Run: npx tsx scripts/xano-call-inventory.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SCAN_DIRS = ["app", "lib"]
const CATALOG_PATH = path.join(ROOT, "xano-apigroups-endpoints.json")
const OUT_PATH = path.join(ROOT, "xano-call-inventory.json")

type CallRecord = {
  envVar: string
  path: string
  method: string
  callingFile: string
  group: string
  hasAuthHelper: boolean
}

type CatalogEndpoint = {
  name: string
  verb: string
  auth: boolean
  description?: string
}

type CatalogGroup = {
  id: string
  canonical: string
  branch: string
  swagger: string
  documentation: string
  endpoints: CatalogEndpoint[]
}

/** Env var → preferred Xano API group name (from catalogue keys). */
const ENV_TO_GROUP: Record<string, string> = {
  XANO_MEDIA_PLANS_BASE_URL: "media_plans",
  XANO_MEDIAPLANS_BASE_URL: "media_plans",
  XANO_MEDIA_CONTAINERS_BASE_URL: "media_plans",
  XANO_CLIENTS_BASE_URL: "Clients",
  XANO_PUBLISHERS_BASE_URL: "Publishers",
  XANO_SCOPES_BASE_URL: "scopes_of_work",
  XANO_DASHBOARDS_BASE_URL: "dashboards",
  XANO_CODEX_BASE_URL: "codex",
  XANO_MEDIA_DETAILS_BASE_URL: "media details",
  XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL: "Clients",
  XANO_FINANCE_FORECAST_TARGETS_BASE_URL: "Clients",
  XANO_SAVE_FILE_BASE_URL: "File_Uploads",
  XANO_BASE_URL: "(generic)",
}

const AUTH_HELPER_RE =
  /\b(xanoAuthHeader|xanoAuthHeaderRecord|xanoPostHeaderRecord|requireXanoAuthHeaderRecord|getAuthHeaders)\b/

const XANO_ENV_RE = /XANO_[A-Z0-9_]*BASE_URL/g

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "__tests__") continue
      walkTsFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      out.push(full)
    }
  }
  return out
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/")
}

function normalizePath(p: string): string {
  return p
    .replace(/^\//, "")
    .replace(/\$\{[^}]+\}/g, "{id}")
    .replace(/:\w+/g, "{id}")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
}

function inferMethodNear(src: string, index: number): string {
  const before = src.slice(Math.max(0, index - 120), index)
  const after = src.slice(index, Math.min(src.length, index + 200))
  const axiosM = before.match(/axios\.(get|post|put|patch|delete)\s*\(\s*$/i)
  if (axiosM) return axiosM[1].toUpperCase()
  const axiosM2 = before.match(/axios\.(get|post|put|patch|delete)\s*\(/i)
  if (axiosM2) return axiosM2[1].toUpperCase()
  const methodOpt = after.match(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i)
  if (methodOpt) return methodOpt[1].toUpperCase()
  if (/\.get\s*\(/.test(before)) return "GET"
  if (/\.post\s*\(/.test(before)) return "POST"
  if (/\.put\s*\(/.test(before)) return "PUT"
  if (/\.patch\s*\(/.test(before)) return "PATCH"
  if (/\.delete\s*\(/.test(before)) return "DELETE"
  // Heuristic from path name
  const pathSlice = after.slice(0, 80)
  if (/post_|create_|generate_/i.test(pathSlice)) return "POST"
  if (/edit_|update_/i.test(pathSlice)) return "PUT"
  if (/delete_/i.test(pathSlice)) return "DELETE"
  return "GET"
}

function windowHasAuth(src: string, index: number): boolean {
  const start = Math.max(0, index - 400)
  const end = Math.min(src.length, index + 500)
  return AUTH_HELPER_RE.test(src.slice(start, end))
}

function firstEnvFromKeysArg(keysArg: string): string {
  const all = keysArg.match(/XANO_[A-Z0-9_]*BASE_URL/g)
  return all?.[0] ?? "XANO_BASE_URL"
}

function addCall(
  map: Map<string, CallRecord>,
  rec: Omit<CallRecord, "group"> & { group?: string },
): void {
  const envVar = rec.envVar
  const group = rec.group ?? ENV_TO_GROUP[envVar] ?? "(unknown)"
  const key = `${group}|${envVar}|${rec.method}|${rec.path}|${rec.callingFile}`
  const existing = map.get(key)
  if (existing) {
    existing.hasAuthHelper = existing.hasAuthHelper || rec.hasAuthHelper
    return
  }
  map.set(key, { ...rec, group })
}

function collectStringConsts(src: string): Map<string, string> {
  const consts = new Map<string, string>()
  const re =
    /(?:const|let)\s+([A-Z_][A-Z0-9_]*)\s*=\s*["'`]([A-Za-z0-9_./{}-]+)["'`]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    consts.set(m[1], m[2])
  }
  // also camelCase path constants
  const re2 =
    /(?:const|let)\s+(\w+)\s*=\s*["'`]([A-Za-z0-9_./{}-]{2,})["'`]/g
  while ((m = re2.exec(src)) !== null) {
    if (!consts.has(m[1]) && /path|PATH|endpoint|ENDPOINT|route|ROUTE/i.test(m[1])) {
      consts.set(m[1], m[2])
    }
    // Always capture ALL_CAPS string consts as potential paths
    if (!consts.has(m[1]) && /^[A-Z][A-Z0-9_]+$/.test(m[1])) {
      consts.set(m[1], m[2])
    }
  }
  return consts
}

function scanFile(file: string, map: Map<string, CallRecord>): void {
  const src = fs.readFileSync(file, "utf8")
  const callingFile = rel(file)
  const fileHasAuthHelper = AUTH_HELPER_RE.test(src)
  const stringConsts = collectStringConsts(src)

  // Skip pure type / re-export / env-definition files that never call HTTP
  if (!/fetch\s*\(|axios\.|xanoUrl\s*\(|getXanoBaseUrl\s*\(/.test(src)) {
    // Still pick up process.env.XANO_* used in URL construction without those helpers
    if (!/process\.env\.XANO_.*BASE_URL/.test(src)) return
  }

  const authAt = (index: number) =>
    fileHasAuthHelper || windowHasAuth(src, index)

  // Pattern 1a: xanoUrl("path", "ENV" | ["ENV", ...])
  const xanoUrlRe =
    /xanoUrl\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\[[^\]]*\]|["'`][^"'`]+["'`])/g
  let m: RegExpExecArray | null
  while ((m = xanoUrlRe.exec(src)) !== null) {
    const endpointPath = normalizePath(m[1])
    const envVar = firstEnvFromKeysArg(m[2])
    addCall(map, {
      envVar,
      path: endpointPath,
      method: inferMethodNear(src, m.index),
      callingFile,
      hasAuthHelper: authAt(m.index),
    })
  }

  // Pattern 1b: xanoUrl(CONST_PATH, "ENV" | [...]) where CONST_PATH is a string const in-file
  const xanoUrlIdentRe =
    /xanoUrl\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\[[^\]]*\]|["'`][^"'`]+["'`])/g
  while ((m = xanoUrlIdentRe.exec(src)) !== null) {
    const resolved = stringConsts.get(m[1])
    if (!resolved) continue
    addCall(map, {
      envVar: firstEnvFromKeysArg(m[2]),
      path: normalizePath(resolved),
      method: inferMethodNear(src, m.index),
      callingFile,
      hasAuthHelper: authAt(m.index),
    })
  }

  // Pattern 1c: xanoUrl("path") — default XANO_BASE_URL
  const xanoUrlSoloRe = /xanoUrl\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g
  while ((m = xanoUrlSoloRe.exec(src)) !== null) {
    addCall(map, {
      envVar: "XANO_BASE_URL",
      path: normalizePath(m[1]),
      method: inferMethodNear(src, m.index),
      callingFile,
      hasAuthHelper: authAt(m.index),
    })
  }

  // Pattern 2: getXanoBaseUrl("ENV") / getXanoBaseUrl(["ENV",...]) then later /path
  // Capture base assignments: const foo = getXanoBaseUrl(...)
  const getBaseRe =
    /(?:const|let)\s+(\w+)\s*=\s*getXanoBaseUrl\s*\(\s*(\[[^\]]*\]|["'`][^"'`]+["'`])\s*\)/g
  const baseVars = new Map<string, string>()
  while ((m = getBaseRe.exec(src)) !== null) {
    baseVars.set(m[1], firstEnvFromKeysArg(m[2]))
  }

  // Also: process.env.XANO_*_BASE_URL assignments
  const envAssignRe =
    /(?:const|let)\s+(\w+)\s*=\s*(?:process\.env\.|)\s*(XANO_[A-Z0-9_]*BASE_URL)/g
  while ((m = envAssignRe.exec(src)) !== null) {
    baseVars.set(m[1], m[2])
  }
  // Ternary / || chains picking env
  const envChainRe =
    /(?:const|let)\s+(\w+)\s*=\s*[^=\n]*?(XANO_[A-Z0-9_]*BASE_URL)/g
  while ((m = envChainRe.exec(src)) !== null) {
    if (!baseVars.has(m[1])) baseVars.set(m[1], m[2])
  }

  for (const [varName, envVar] of baseVars) {
    let u: RegExpExecArray | null

    // Concat: baseUrl + "/foo" or baseUrl + '/foo'
    const concatRe = new RegExp(
      varName + "\\s*\\+\\s*[\"'](/[A-Za-z0-9_{}/.\\-]+)[\"']",
      "g",
    )
    while ((u = concatRe.exec(src)) !== null) {
      const pathOnly = normalizePath(u[1].split("?")[0].replace(/\$\{[^}]+\}/g, "{id}"))
      if (!pathOnly || pathOnly.length < 2) continue
      addCall(map, {
        envVar,
        path: pathOnly,
        method: inferMethodNear(src, u.index),
        callingFile,
        hasAuthHelper: authAt(u.index),
      })
    }

    // Template: `${baseUrl}/foo/bar`
    const tplRe = new RegExp(
      "`\\$\\{" + varName + "\\}(/[^`\"']+)`",
      "g",
    )
    while ((u = tplRe.exec(src)) !== null) {
      let p = u[1].split("?")[0]
      p = normalizePath(p.replace(/\$\{[^}]+\}/g, "{id}"))
      if (!p) continue
      addCall(map, {
        envVar,
        path: p,
        method: inferMethodNear(src, u.index),
        callingFile,
        hasAuthHelper: authAt(u.index),
      })
    }

    // Template: `${base}/${pathIdent}` where pathIdent is a string const
    const tplIdentRe = new RegExp(
      "`\\$\\{" + varName + "\\}/\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}",
      "g",
    )
    while ((u = tplIdentRe.exec(src)) !== null) {
      const resolved = stringConsts.get(u[1])
      if (!resolved) continue
      addCall(map, {
        envVar,
        path: normalizePath(resolved),
        method: inferMethodNear(src, u.index),
        callingFile,
        hasAuthHelper: authAt(u.index),
      })
    }
  }

  // Pattern 3: inline process.env.XANO_*_BASE_URL + "/path"
  const inlineRe =
    /process\.env\.(XANO_[A-Z0-9_]*BASE_URL)\s*(?:\?\?[^?]+\?[^:]+:\s*)?(?:\|\|[^\n]+)?[^\n]{0,80}?[`"'](\/[A-Za-z0-9_./{}-]+)/g
  while ((m = inlineRe.exec(src)) !== null) {
    addCall(map, {
      envVar: m[1],
      path: normalizePath(m[2]),
      method: inferMethodNear(src, m.index),
      callingFile,
      hasAuthHelper: authAt(m.index),
    })
  }

  // Pattern 4: media-details proxy `${base}/${path}` style where path is dynamic
  if (/XANO_MEDIA_DETAILS_BASE_URL/.test(src) && /media.details|media_details/i.test(callingFile)) {
    addCall(map, {
      envVar: "XANO_MEDIA_DETAILS_BASE_URL",
      path: "{proxy-path}",
      method: "ANY",
      callingFile,
      hasAuthHelper: fileHasAuthHelper,
      group: "media details",
    })
  }
}

function catalogPathKey(name: string): string {
  return name.replace(/\{[^}]+\}/g, "{id}").replace(/\/$/, "")
}

function pathsRoughlyMatch(appPath: string, catalogName: string): boolean {
  const a = catalogPathKey(appPath).toLowerCase()
  const c = catalogPathKey(catalogName).toLowerCase()
  if (a === c) return true
  if (a.replace(/\{id\}/g, "") === c.replace(/\{id\}/g, "")) return true
  // app path is first segment of catalogue name
  const aBase = a.split("/")[0]
  const cBase = c.split("/")[0]
  if (aBase && aBase === cBase && !a.includes("/") && c.includes("/")) return false
  if (a === cBase || c === aBase) return true
  // strip trailing /{id}
  if (a.replace(/\/\{id\}$/, "") === c.replace(/\/\{id\}$/, "")) return true
  return false
}

function main(): void {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as Record<
    string,
    CatalogGroup
  >

  const map = new Map<string, CallRecord>()
  for (const dir of SCAN_DIRS) {
    for (const file of walkTsFiles(path.join(ROOT, dir))) {
      scanFile(file, map)
    }
  }

  const calls = [...map.values()].sort((a, b) => {
    const g = a.group.localeCompare(b.group)
    if (g !== 0) return g
    const e = a.envVar.localeCompare(b.envVar)
    if (e !== 0) return e
    const p = a.path.localeCompare(b.path)
    if (p !== 0) return p
    return a.callingFile.localeCompare(b.callingFile)
  })

  // Build flat catalogue list
  const catalogFlat: Array<{
    group: string
    name: string
    verb: string
    auth: boolean
  }> = []
  for (const [group, g] of Object.entries(catalog)) {
    for (const ep of g.endpoints ?? []) {
      catalogFlat.push({
        group,
        name: ep.name,
        verb: ep.verb,
        auth: Boolean(ep.auth),
      })
    }
  }

  const matchedCatalogKeys = new Set<string>()
  const appCallsPublic: Array<CallRecord & { catalogMatch?: string }> = []
  const appCallsAuth: Array<CallRecord & { catalogMatch?: string }> = []
  const appCallsUnmatched: CallRecord[] = []

  for (const call of calls) {
    if (call.path === "{proxy-path}") {
      appCallsUnmatched.push(call)
      continue
    }
    const candidates = catalogFlat.filter(
      (c) =>
        (call.group === c.group ||
          (call.group === "media_plans" && c.group === "media_plans") ||
          (call.group === "Clients" && c.group === "Clients")) &&
        pathsRoughlyMatch(call.path, c.name) &&
        (call.method === "ANY" ||
          call.method === c.verb.toUpperCase() ||
          // allow GET inventory to match POST-named tables when method heuristic wrong
          pathsRoughlyMatch(call.path, c.name)),
    )
    // Prefer same verb
    const sameVerb = candidates.filter(
      (c) => c.verb.toUpperCase() === call.method || call.method === "ANY",
    )
    const hit = (sameVerb[0] ?? candidates[0]) as
      | (typeof catalogFlat)[0]
      | undefined
    if (!hit) {
      // try any group by path only
      const anyHit = catalogFlat.find((c) => pathsRoughlyMatch(call.path, c.name))
      if (anyHit) {
        matchedCatalogKeys.add(`${anyHit.group}|${anyHit.verb}|${anyHit.name}`)
        const enriched = { ...call, catalogMatch: `${anyHit.verb} ${anyHit.name}` }
        if (anyHit.auth) appCallsAuth.push(enriched)
        else appCallsPublic.push(enriched)
      } else {
        appCallsUnmatched.push(call)
      }
      continue
    }
    matchedCatalogKeys.add(`${hit.group}|${hit.verb}|${hit.name}`)
    const enriched = { ...call, catalogMatch: `${hit.verb} ${hit.name}` }
    if (hit.auth) appCallsAuth.push(enriched)
    else appCallsPublic.push(enriched)
  }

  const unusedInXano = catalogFlat
    .filter((c) => !matchedCatalogKeys.has(`${c.group}|${c.verb}|${c.name}`))
    .map((c) => ({
      group: c.group,
      verb: c.verb,
      name: c.name,
      auth: c.auth,
    }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

  const bypasses = calls
    .filter((c) => !c.hasAuthHelper)
    .map((c) => ({
      envVar: c.envVar,
      path: c.path,
      method: c.method,
      callingFile: c.callingFile,
      group: c.group,
    }))

  const byGroup: Record<string, CallRecord[]> = {}
  for (const c of calls) {
    ;(byGroup[c.group] ??= []).push(c)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    catalogTotals: {
      groups: Object.keys(catalog).length,
      endpoints: catalogFlat.length,
      authRequired: catalogFlat.filter((c) => c.auth).length,
      public: catalogFlat.filter((c) => !c.auth).length,
    },
    appCallCount: calls.length,
    uniquePaths: new Set(calls.map((c) => `${c.method} ${c.path}`)).size,
    authHelperCoverage: {
      withHelper: calls.filter((c) => c.hasAuthHelper).length,
      withoutHelper: calls.filter((c) => !c.hasAuthHelper).length,
    },
    authMechanism: {
      envVar: "XANO_API_KEY",
      header: "Authorization: Bearer <token>",
      helpers: [
        "lib/api/xano.ts → xanoAuthHeader / xanoAuthHeaderRecord / xanoPostHeaderRecord / requireXanoAuthHeaderRecord",
      ],
      note: "Server-only. Never expose via NEXT_PUBLIC_*. Empty key omits the header (current public-group behaviour).",
    },
  }

  const output = {
    summary,
    calls,
    byGroup,
    crossReference: {
      "(a) appCallsThatArePublicInXano": appCallsPublic,
      "(a2) appCallsThatAlreadyRequireAuthInXano": appCallsAuth,
      "(a3) appCallsUnmatchedToCatalog": appCallsUnmatched,
      "(b) xanoEndpointsWithNoAppCall": unusedInXano,
    },
    authHeaderBypasses: bypasses,
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8")
  console.log(`Wrote ${OUT_PATH}`)
  console.log(
    `Calls: ${calls.length} | public-matched: ${appCallsPublic.length} | auth-matched: ${appCallsAuth.length} | unmatched: ${appCallsUnmatched.length} | unused Xano: ${unusedInXano.length} | bypasses: ${bypasses.length}`,
  )
}

main()
