/**
 * Regenerates docs/brain/api-tenant-classification.md from a live recount of
 * every app/api route.ts handler. Run:
 *   node --import tsx scripts/generate-api-tenant-classification.ts
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  inventoryAppApi,
  summarizeInventory,
  type HandlerRow,
} from "../lib/api/tenantRouteInventory.ts"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const outPath = path.join(root, "docs", "brain", "api-tenant-classification.md")

/** D1 (SEC-11) + D2 (SEC-13) closed these tenant-scoped surfaces. */
const D1_D2_FIXED = new Set([
  "GET /api/media_plans",
  "GET /api/media_plans/cinema",
  "GET /api/media_plans/digi-bvod",
  "GET /api/media_plans/influencers",
  "GET /api/media_plans/integration",
  "GET /api/media_plans/newspaper",
  "GET /api/media_plans/prog-display",
  "GET /api/media_plans/prog-ooh",
  "GET /api/media_plans/prog-video",
  "GET /api/media_plans/production",
  "GET /api/media_plans/search",
  "GET /api/media_plans/social",
  "GET /api/media_plans/television",
  "POST /api/pacing/search",
  "GET /api/billing-overrides",
  "POST /api/billing-overrides/replace_line",
  "POST /api/billing-overrides/reset_line",
  "POST /api/billing-overrides/refetch-anomaly",
  "POST /api/billing-overrides/working-dedupe-anomaly",
  "GET /api/mba-line-approvals",
  "PATCH /api/mba-line-approvals",
])

function keyOf(r: HandlerRow): string {
  return `${r.method} ${r.apiPath}`
}

type Remaining = {
  key: string
  file: string
  severity: string
}

function severityFor(r: HandlerRow): string {
  const p = r.apiPath
  if (p === "/api/mediaplans/mbanumber") {
    return "P2 — MBA mint; any authenticated session can allocate numbers for any mbaidentifier (SEC-14)."
  }
  if (p.includes("expected-spend-to-date")) {
    return "P2 — no local MBA gate; cookie-forwards to MBA detail (relies on upstream AuthZ)."
  }
  if (p === "/api/dashboard/spend-parity") {
    return "P2 soft — book-wide spend parity tooling; 404 in production; non-prod cross-tenant read."
  }
  if (p === "/api/me") {
    return "session-ref — self identity only; not tenant MBA rows."
  }
  if (p.startsWith("/api/publishers") || p.includes("media-container-best-practice")) {
    return "session-ref — reference catalogue; middleware session only (intentional SEC-G)."
  }
  return "P2 — tenant-scoped handler with no recognised AuthZ symbol in the handler chain."
}

function remainingExposures(rows: HandlerRow[]): Remaining[] {
  return rows
    .filter((r) => r.class === "tenant-scoped" && r.mechanism === "none")
    .filter((r) => !D1_D2_FIXED.has(keyOf(r)))
    .map((r) => ({
      key: keyOf(r),
      file: r.file,
      severity: severityFor(r),
    }))
}

function adminConsolidationCandidates(rows: HandlerRow[]): string {
  // Report-only: book-wide reporting that could live under /api/admin/*
  const adminNone = rows.filter(
    (r) => r.class === "admin-only" && r.mechanism === "none"
  )
  const candidates = [
    {
      path: "/api/dashboard/global-monthly-client-spend",
      gate: "requireRole(admin)",
      links: "`components/dashboard/*`, admin spend charts, any fetch to this path",
    },
    {
      path: "/api/dashboard/global-monthly-publisher-spend",
      gate: "requireRole(admin)",
      links: "same as client-spend twin",
    },
    {
      path: "/api/dashboard/spend-parity",
      gate: "none today (404 in prod)",
      links: "ops/debug bookmarks only",
    },
    {
      path: "/api/pacing/admin/orphans*",
      gate: "requireAdmin",
      links: "pacing orphans admin UI; optional rename to `/api/admin/pacing/orphans*`",
    },
    {
      path: "/api/finance/forecast (gated root)",
      gate: "requireRole(admin) on `/api/finance/forecast`",
      links: "`ForecastingPageClient`, finance forecast section",
    },
    {
      path: "/api/finance/forecast/snapshots*",
      gate: "none (session only) — consolidate under `/api/admin/finance/forecast/*`",
      links: "`ForecastingPageClient`, `FinanceForecastVariancePageClient`",
    },
    {
      path: "/api/finance/forecast/targets",
      gate: "none (session only)",
      links: "`TargetGrid.tsx` GET/POST/PATCH",
    },
    {
      path: "/api/finance/forecast/variance/target-vs-actual",
      gate: "none (session only)",
      links: "`VarianceTargetVsActualView.tsx`",
    },
    {
      path: "/api/finance/* (other book-wide)",
      gate: "requireFinanceAdmin / requireRole (most already gated)",
      links: "Finance hub sections, invoicing, xero-queue — large blast radius; alias first",
    },
  ]

  const lines = [
    "## Admin consolidation candidates (report-only)",
    "",
    "Daytime decision — **do not move tonight**. Candidates for a single `/api/admin/*` namespace with path-prefix + handler `requireAdmin` / `requireFinanceAdmin`. Tenant MBA surfaces stay put.",
    "",
    "| Current path | Gate today | What would break if moved |",
    "|---|---|---|",
  ]
  for (const c of candidates) {
    lines.push(`| \`${c.path}\` | ${c.gate} | ${c.links} |`)
  }
  lines.push("")
  lines.push(
    "**Do not move:** `/api/mediaplans/mba/*`, creative MBA routes, pacing campaign tabs, `/api/dashboard/[slug]*`, billing-overrides, mba-line-approvals — tenant-scoped with `checkClientMbaAccess`."
  )
  lines.push("")

  const adminFiles = new Set(
    rows.filter((r) => r.apiPath.startsWith("/api/admin/")).map((r) => r.file)
  )
  lines.push(
    `Existing \`/api/admin/*\` handlers in this recount: **${rows.filter((r) => r.apiPath.startsWith("/api/admin/")).length}** methods across **${adminFiles.size}** files.`
  )
  lines.push("")
  lines.push(
    `### Admin-only class with mechanism none (this recount): **${adminNone.length}**`
  )
  lines.push("")
  if (adminNone.length > 0) {
    lines.push("| Handler | File |")
    lines.push("|---|---|")
    for (const r of adminNone.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
      lines.push(`| \`${keyOf(r)}\` | \`${r.file}\` |`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

function renderTable(rows: HandlerRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    const c = a.apiPath.localeCompare(b.apiPath)
    if (c !== 0) return c
    return a.method.localeCompare(b.method)
  })
  const lines = [
    "| Method | Path | Class | Mechanism | File |",
    "|---|---|---|---|---|",
  ]
  for (const r of sorted) {
    const mech =
      r.mechanism === "none" && r.guardsFound.includes("verifyFrameToken")
        ? "none (verifyFrameToken)"
        : r.mechanism
    lines.push(
      `| ${r.method} | \`${r.apiPath}\` | ${r.class} | ${mech} | \`${r.file}\` |`
    )
  }
  return lines.join("\n")
}

const rows = inventoryAppApi(root)
const summary = summarizeInventory(rows)
const remaining = remainingExposures(rows)

const md = `# API tenant classification

Living recount of every HTTP handler under \`app/api\` \`route.ts\` files. Regenerated by \`scripts/generate-api-tenant-classification.ts\` (do not hand-edit the table — re-run the script).

**Recount (this run):** **${summary.files}** route files · **${summary.handlers}** handlers.

| Class | Count |
|---|---:|
| tenant-scoped | ${summary.byClass["tenant-scoped"]} |
| admin-only | ${summary.byClass["admin-only"]} |
| public | ${summary.byClass.public} |
| internal-cron | ${summary.byClass["internal-cron"]} |

| Mechanism | Count |
|---|---:|
| checkClientMbaAccess | ${summary.byMechanism.checkClientMbaAccess} |
| requireRole | ${summary.byMechanism.requireRole} |
| CRON_SECRET | ${summary.byMechanism.CRON_SECRET} |
| none | ${summary.byMechanism.none} |

**Legend**

| Class | Meaning |
|---|---|
| tenant-scoped | Client-owned / MBA-scoped data — must gate with server-side scope |
| admin-only | Staff book-wide (\`requireRole\` / \`requireAdmin\` / \`requireFinanceAdmin\` / \`requireCodexInternalAccess\` / \`requireProxyStaff\` / inline admin deny) |
| public | No Auth0 session principal (signed frame token) |
| internal-cron | \`/api/cron/*\` + \`assertCronSecret\` |

| Mechanism | Maps from |
|---|---|
| checkClientMbaAccess | \`checkClientMbaAccess\`, \`resolveClientMbaScope\`, \`requirePacingAccess\`, \`createChannelLineItemsGetHandler\`, \`getUserClientSlugs\` / \`getUserClientIdentifier\` used as AuthZ |
| requireRole | \`requireRole\`, \`requireAdmin\`, \`requireFinanceAdmin\`, \`requireCodexInternalAccess\`, \`requireProxyStaff\`, inline admin/client deny |
| CRON_SECRET | \`assertCronSecret\` |
| none | No recognised guard in the handler body or one-hop same-file helper |

Detection walks each exported method body and one hop into same-file helpers (e.g. \`GET\` → \`proxyRequest\` → \`requireProxyStaff\`; cron \`POST\` → \`GET\`).

---

## Remaining exposures

Tenant-scoped handlers whose mechanism is **none**, excluding surfaces closed by D1 (SEC-11: \`media_plans\` list + channel GETs + \`pacing/search\`) and D2 (SEC-13: billing-overrides + mba-line-approvals). **Classify and report only — no fixes in this pass.**

| Handler | File | Severity |
|---|---|---|
${remaining.map((r) => `| \`${r.key}\` | \`${r.file}\` | ${r.severity} |`).join("\n")}

Count: **${remaining.length}**.

---

${adminConsolidationCandidates(rows)}

---

## Full handler table

${renderTable(rows)}
`

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, md)
console.log(
  `Wrote ${outPath} (${summary.files} files, ${summary.handlers} handlers, ${remaining.length} remaining exposures)`
)
