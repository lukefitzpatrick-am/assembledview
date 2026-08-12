/**
 * Static inventory of app/api route.ts handlers for tenant AuthZ.
 * Shared by the classification doc generator and the CI regression harness.
 */
import fs from "node:fs"
import path from "node:path"

export const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

/** Coarse class for the durable classification table. */
export type RouteClass =
  | "tenant-scoped"
  | "admin-only"
  | "public"
  | "internal-cron"

/**
 * Enforcement mechanism column (user-facing buckets).
 * Recognised guards map into these four; harness recognises a wider set.
 */
export type Mechanism =
  | "checkClientMbaAccess"
  | "requireRole"
  | "CRON_SECRET"
  | "none"

export type HandlerRow = {
  file: string
  apiPath: string
  method: HttpMethod
  class: RouteClass
  mechanism: Mechanism
  /** Concrete symbols found in the handler body (for debugging / allowlist). */
  guardsFound: string[]
}

const RECOGNISED_GUARD_PATTERNS: { name: string; re: RegExp; bucket: Mechanism }[] = [
  { name: "checkClientMbaAccess", re: /\bcheckClientMbaAccess\b/, bucket: "checkClientMbaAccess" },
  { name: "resolveClientMbaScope", re: /\bresolveClientMbaScope\b/, bucket: "checkClientMbaAccess" },
  { name: "requirePacingAccess", re: /\brequirePacingAccess\b/, bucket: "checkClientMbaAccess" },
  {
    name: "createChannelLineItemsGetHandler",
    re: /\bcreateChannelLineItemsGetHandler\b/,
    bucket: "checkClientMbaAccess",
  },
  { name: "requireRole", re: /\brequireRole\b/, bucket: "requireRole" },
  { name: "requireAdmin", re: /\brequireAdmin\b/, bucket: "requireRole" },
  { name: "requireFinanceAdmin", re: /\brequireFinanceAdmin\b/, bucket: "requireRole" },
  {
    name: "requireCodexInternalAccess",
    re: /\brequireCodexInternalAccess\b/,
    bucket: "requireRole",
  },
  { name: "requireProxyStaff", re: /\brequireProxyStaff\b/, bucket: "requireRole" },
  { name: "assertCronSecret", re: /\bassertCronSecret\b/, bucket: "CRON_SECRET" },
  { name: "verifyFrameToken", re: /\bverifyFrameToken\b/, bucket: "none" },
  { name: "getUserClientSlugs", re: /\bgetUserClientSlugs\b/, bucket: "checkClientMbaAccess" },
  {
    name: "getUserClientIdentifier",
    re: /\bgetUserClientIdentifier\b/,
    bucket: "checkClientMbaAccess",
  },
  {
    name: "inlineAdminDeny",
    re: /if\s*\(\s*!?roles\.includes\(\s*["']admin["']\s*\)/,
    bucket: "requireRole",
  },
  {
    name: "inlineClientBlock",
    re: /if\s*\(\s*roles\.includes\(\s*["']client["']\s*\)/,
    bucket: "requireRole",
  },
]

/** Guards the regression harness treats as "has AuthZ" (any match = pass). */
export const HARNESS_GUARD_NAMES = new Set(
  RECOGNISED_GUARD_PATTERNS.filter((p) => p.name !== "verifyFrameToken").map((p) => p.name)
)

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

export function routeFileToApiPath(relFromAppApi: string): string {
  const dir = relFromAppApi.replace(/\/route\.tsx?$/, "").replace(/\\/g, "/")
  return "/api/" + dir
}

/** Extract source span for one exported HTTP handler (function or const). */
export function extractHandlerBody(source: string, method: HttpMethod): string | null {
  const fnRe = new RegExp(String.raw`export\s+(?:async\s+)?function\s+${method}\b`)
  const fnMatch = fnRe.exec(source)
  if (fnMatch && fnMatch.index != null) {
    const afterName = fnMatch.index + fnMatch[0].length
    const bodyOpen = findFunctionBodyOpenBrace(source, afterName)
    if (bodyOpen >= 0) return sliceBalancedBlock(source, bodyOpen)
  }

  const constRe = new RegExp(String.raw`export\s+const\s+${method}\b\s*=`)
  const constMatch = constRe.exec(source)
  if (constMatch && constMatch.index != null) {
    const start = constMatch.index
    const rest = source.slice(start)
    const nextExport = rest.search(/\nexport\s+/)
    return nextExport === -1 ? rest : rest.slice(0, nextExport)
  }
  return null
}

/**
 * After `function NAME`, skip the parameter list (which may contain `{ params }`
 * type braces) and return the index of the function-body `{`.
 */
function findFunctionBodyOpenBrace(source: string, from: number): number {
  let i = from
  while (i < source.length && /\s/.test(source[i]!)) i++
  if (source[i] !== "(") {
    // No params — rare; find next `{`
    const idx = source.indexOf("{", i)
    return idx
  }
  // Balance parentheses; ignore braces inside the param list.
  let depth = 0
  for (; i < source.length; i++) {
    const ch = source[i]!
    if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
  }
  while (i < source.length && /\s/.test(source[i]!)) i++
  // Optional return-type annotation before body: `: NextResponse {`
  if (source[i] === ":") {
    // Scan until `{` at depth 0 of angle/brace for simple cases — prefer first `{`
    // that is not inside `<>` generics of the return type.
    let angle = 0
    for (; i < source.length; i++) {
      const ch = source[i]!
      if (ch === "<") angle++
      else if (ch === ">") angle = Math.max(0, angle - 1)
      else if (ch === "{" && angle === 0) return i
    }
    return -1
  }
  return source[i] === "{" ? i : -1
}

function sliceBalancedBlock(source: string, openBraceIndex: number): string {
  let depth = 0
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return source.slice(openBraceIndex, i + 1)
    }
  }
  return source.slice(openBraceIndex)
}

export function detectExportedMethods(source: string): HttpMethod[] {
  const found = new Set<HttpMethod>()
  for (const m of HTTP_METHODS) {
    if (extractHandlerBody(source, m) != null) found.add(m)
  }
  return HTTP_METHODS.filter((m) => found.has(m))
}

export function detectGuards(source: string): { names: string[]; mechanism: Mechanism } {
  const names: string[] = []
  let mechanism: Mechanism = "none"
  const priority: Mechanism[] = ["checkClientMbaAccess", "requireRole", "CRON_SECRET", "none"]
  let bestIdx = priority.length - 1

  for (const g of RECOGNISED_GUARD_PATTERNS) {
    if (g.re.test(source)) {
      names.push(g.name)
      const idx = priority.indexOf(g.bucket)
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx
        mechanism = g.bucket
      }
    }
  }
  return { names, mechanism }
}

/**
 * Resolve guards for one handler: scan the export body, then one level of
 * same-file helpers it calls (e.g. GET → proxyRequest → requireProxyStaff).
 */
export function detectGuardsForHandler(
  fileSource: string,
  method: HttpMethod
): { names: string[]; mechanism: Mechanism } {
  const body = extractHandlerBody(fileSource, method)
  if (!body) return { names: [], mechanism: "none" }

  const direct = detectGuards(body)
  if (direct.mechanism !== "none") return direct

  const callees = new Set<string>()
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = callRe.exec(body))) {
    const name = m[1]!
    if (
      [
        "if",
        "for",
        "while",
        "switch",
        "catch",
        "function",
        "return",
        "await",
        "typeof",
        "new",
        "Promise",
        "NextResponse",
        "URL",
        "String",
        "Number",
        "Boolean",
        "Array",
        "Object",
        "JSON",
        "console",
        "fetch",
        "Error",
      ].includes(name)
    ) {
      continue
    }
    callees.add(name)
  }

  const mergedNames = new Set<string>(direct.names)
  let mechanism: Mechanism = "none"
  const priority: Mechanism[] = ["checkClientMbaAccess", "requireRole", "CRON_SECRET", "none"]
  let bestIdx = priority.length - 1

  for (const callee of callees) {
    // Same-file helper OR delegated HTTP export (cron POST → GET).
    const helperBody =
      extractNamedFunctionBody(fileSource, callee) ??
      (HTTP_METHODS.includes(callee as HttpMethod)
        ? extractHandlerBody(fileSource, callee as HttpMethod)
        : null)
    if (!helperBody) continue
    const g = detectGuards(helperBody)
    for (const n of g.names) mergedNames.add(n)
    const idx = priority.indexOf(g.mechanism)
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx
      mechanism = g.mechanism
    }
    // One more hop: helper → requireProxyStaff
    if (g.mechanism === "none") {
      const nestedCallRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
      let nm: RegExpExecArray | null
      while ((nm = nestedCallRe.exec(helperBody))) {
        const nestedName = nm[1]!
        const nested =
          extractNamedFunctionBody(fileSource, nestedName) ??
          (HTTP_METHODS.includes(nestedName as HttpMethod)
            ? extractHandlerBody(fileSource, nestedName as HttpMethod)
            : null)
        if (!nested) continue
        const ng = detectGuards(nested)
        for (const n of ng.names) mergedNames.add(n)
        const nidx = priority.indexOf(ng.mechanism)
        if (nidx >= 0 && nidx < bestIdx) {
          bestIdx = nidx
          mechanism = ng.mechanism
        }
      }
    }
  }

  return { names: [...mergedNames], mechanism }
}

function extractNamedFunctionBody(source: string, name: string): string | null {
  const re = new RegExp(
    String.raw`(?:export\s+)?(?:async\s+)?function\s+${name}\b`
  )
  const match = re.exec(source)
  if (!match || match.index == null) return null
  const afterName = match.index + match[0].length
  const bodyOpen = findFunctionBodyOpenBrace(source, afterName)
  if (bodyOpen < 0) return null
  return sliceBalancedBlock(source, bodyOpen)
}

/**
 * Heuristic classification from path + guards.
 * Prefer path conventions (cron/, admin/) then mechanism.
 */
export function classifyHandler(opts: {
  apiPath: string
  method: HttpMethod
  mechanism: Mechanism
  guardsFound: string[]
}): RouteClass {
  const p = opts.apiPath
  if (p.startsWith("/api/cron/") || opts.mechanism === "CRON_SECRET") {
    return "internal-cron"
  }
  if (opts.guardsFound.includes("verifyFrameToken")) {
    return "public"
  }
  // Staff namespaces (book-wide by design)
  if (
    p.startsWith("/api/admin/") ||
    p.startsWith("/api/finance/") ||
    p.startsWith("/api/codex/") ||
    p.startsWith("/api/pacing/admin/")
  ) {
    return "admin-only"
  }
  if (opts.mechanism === "requireRole") {
    return "admin-only"
  }
  if (opts.mechanism === "checkClientMbaAccess") {
    return "tenant-scoped"
  }
  // Default: treat as tenant-scoped so missing guards surface in remaining exposures.
  return "tenant-scoped"
}

export function listRouteFiles(appApiRoot: string): string[] {
  const out: string[] = []
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && /^route\.tsx?$/.test(ent.name)) out.push(full)
    }
  }
  walk(appApiRoot)
  return out.sort((a, b) => toPosix(a).localeCompare(toPosix(b)))
}

export function inventoryAppApi(repoRoot: string): HandlerRow[] {
  const appApiRoot = path.join(repoRoot, "app", "api")
  const files = listRouteFiles(appApiRoot)
  const rows: HandlerRow[] = []

  for (const abs of files) {
    const relFromApi = toPosix(path.relative(appApiRoot, abs))
    const relFromRepo = toPosix(path.relative(repoRoot, abs))
    const source = fs.readFileSync(abs, "utf8")
    const methods = detectExportedMethods(source)
    const apiPath = routeFileToApiPath(relFromApi)

    for (const method of methods) {
      const { names, mechanism } = detectGuardsForHandler(source, method)
      const cls = classifyHandler({
        apiPath,
        method,
        mechanism,
        guardsFound: names,
      })
      rows.push({
        file: relFromRepo,
        apiPath,
        method,
        class: cls,
        mechanism,
        guardsFound: names,
      })
    }
  }

  return rows
}

export function summarizeInventory(rows: HandlerRow[]) {
  const byClass: Record<RouteClass, number> = {
    "tenant-scoped": 0,
    "admin-only": 0,
    public: 0,
    "internal-cron": 0,
  }
  const byMechanism: Record<Mechanism, number> = {
    checkClientMbaAccess: 0,
    requireRole: 0,
    CRON_SECRET: 0,
    none: 0,
  }
  const files = new Set(rows.map((r) => r.file))
  for (const r of rows) {
    byClass[r.class]++
    byMechanism[r.mechanism]++
  }
  return {
    files: files.size,
    handlers: rows.length,
    byClass,
    byMechanism,
  }
}
