/**
 * Single source of truth for user-facing route identity.
 * Sidebar labels, breadcrumbs, command palette, and document titles all derive from here.
 *
 * Paths use App Router patterns (`[param]`). Labels are product nouns — Campaigns / Planning —
 * not historical URL segments (mediaplans / behavioural-planner). URLs are never renamed here.
 */

export type NavRole = "admin" | "client" | "any"

/** Lucide icon key — mapped to components in UI consumers only. */
export type RouteIconKey =
  | "LayoutDashboard"
  | "FileText"
  | "Images"
  | "ClipboardList"
  | "ListTodo"
  | "TrendingUp"
  | "Compass"
  | "Building2"
  | "Users"
  | "DollarSign"
  | "BookOpen"
  | "PlusCircle"
  | "UserCircle"
  | "Shield"
  | "Calculator"
  | "Link2"
  | "Layers"
  | "Globe"
  | "Lightbulb"
  | "Cloud"
  | "Clock"
  | "MessageSquare"

export type RouteManifestEntry = {
  /** App Router path, e.g. `/mediaplans/mba/[mba_number]/edit`. */
  path: string
  /** Sidebar / palette short name. */
  label: string
  /** Document `<title>` (may be longer than label). */
  title: string
  group?: string
  icon?: RouteIconKey
  /** Defaults to `label` when omitted. */
  breadcrumbLabel?: string
  inPalette: boolean
  /** When true, appears in the admin primary sidebar list (order from ADMIN_SIDEBAR_PATHS). */
  inSidebar?: boolean
  /** Sidebar active-state: exact path match only. */
  sidebarExact?: boolean
  /** Who may see this in the palette / role-gated surfaces. Default: any authenticated. */
  roles?: NavRole[]
  /**
   * Real page that can be linked in breadcrumbs.
   * `false` = intermediate crumb only (no `page.tsx`; linking would 404).
   */
  hasPage?: boolean
  /** Extra cmdk search tokens. */
  searchTerms?: string
  /** Include in the mobile bottom nav (admin). */
  inBottomNav?: boolean
}

/**
 * Routes under `app/` that are intentionally NOT in ROUTE_MANIFEST as product destinations.
 * Keep this list complete so coverage tests stay honest.
 */
export const ROUTE_MANIFEST_EXCLUSIONS: ReadonlyArray<{
  path: string
  reason: string
}> = [
  {
    path: "/auth/[auth0]",
    reason: "Auth0 SDK callback / login handlers — not a product page",
  },
  {
    path: "/api/**",
    reason: "API route handlers — not user-facing UI (out of scope for this manifest)",
  },
]

/**
 * Admin sidebar structure (AV-UI-1). Paths must exist in ROUTE_MANIFEST.
 * Top cluster: Home + Knowledge Hub. Groups: Plan / Deliver / Finance / Admin (muted).
 * "Client Dashboards" is a collapsible, not a route — rendered under Creative in Deliver by
 * AppSidebar. Finance has four sidebar items (FIN-1). Create Campaign is palette-only (verb).
 * Footer: UserMenu only (Users list in Admin; invite via /admin/users/new).
 */
export type AdminSidebarGroupTone = "default" | "muted"

export type AdminSidebarGroup = {
  id: "top" | "plan" | "deliver" | "finance" | "admin"
  /** Null = ungrouped top cluster (no section heading). */
  label: string | null
  tone?: AdminSidebarGroupTone
  paths: readonly string[]
}

export const ADMIN_SIDEBAR_GROUPS: readonly AdminSidebarGroup[] = [
  { id: "top", label: null, paths: ["/dashboard", "/knowledge"] },
  {
    id: "plan",
    label: "Plan",
    paths: ["/tools/behavioural-planner", "/mediaplans", "/scopes-of-work"],
  },
  {
    id: "deliver",
    label: "Deliver",
    paths: ["/pacing", "/creative"],
  },
  {
    id: "finance",
    label: "Finance",
    paths: [
      "/finance/invoicing",
      "/finance/costs",
      "/finance/forecasting",
      "/finance/investment",
    ],
  },
  {
    id: "admin",
    label: "Admin",
    tone: "muted",
    paths: [
      "/tasks",
      "/insights",
      "/client",
      "/publishers",
      "/admin/users",
      "/admin/m365-reconciliation",
      "/admin/myhours-mapping",
      "/admin/fireflies-unattributed",
      "/admin/publisher-profiles",
      "/admin/schedule-ingest",
    ],
  },
] as const

/** Flattened sidebar destinations (order = group order × path order). */
export const ADMIN_SIDEBAR_PATHS = ADMIN_SIDEBAR_GROUPS.flatMap((g) => [...g.paths])

/** Footer now holds UserMenu only. */
export const ADMIN_SIDEBAR_FOOTER_PATHS = [] as const

/** Mobile bottom tabs — Create Campaign removed; Creative keeps a 5th workflow slot. */
export const ADMIN_BOTTOM_NAV_PATHS = [
  "/dashboard",
  "/mediaplans",
  "/pacing",
  "/finance/invoicing",
  "/creative",
] as const

export const ROUTE_MANIFEST: readonly RouteManifestEntry[] = [
  // ── Core nav (sidebar) ─────────────────────────────────────────────
  {
    path: "/",
    label: "Home",
    title: "AssembledView",
    breadcrumbLabel: "Home",
    inPalette: false,
    hasPage: true,
    group: "system",
  },
  {
    path: "/dashboard",
    label: "Home",
    title: "Home",
    icon: "LayoutDashboard",
    inPalette: true,
    inSidebar: true,
    sidebarExact: true,
    inBottomNav: true,
    roles: ["admin"],
    searchTerms: "today dashboard overview home",
    group: "core",
  },
  {
    path: "/mediaplans",
    label: "Campaigns",
    title: "Campaigns",
    icon: "FileText",
    inPalette: true,
    inSidebar: true,
    inBottomNav: true,
    roles: ["admin"],
    searchTerms: "media plans mediaplans mba",
    group: "core",
  },
  {
    path: "/creative",
    label: "Creative",
    title: "Creative",
    icon: "Images",
    inPalette: true,
    inSidebar: true,
    inBottomNav: true,
    roles: ["admin"],
    group: "core",
  },
  {
    path: "/scopes-of-work",
    label: "Scopes of Work",
    title: "Scopes of Work",
    icon: "ClipboardList",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "sow scopes",
    group: "core",
  },
  {
    path: "/tasks",
    label: "Codex",
    title: "Codex",
    icon: "ListTodo",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "tasks codex",
    group: "core",
    // Shadow-phase: sidebar also gated by CODEX_SHADOW_ROLES in AppSidebar.
  },
  {
    path: "/tasks/[id]",
    label: "Task",
    title: "Codex Task",
    inPalette: false,
    roles: ["admin"],
    group: "core",
  },
  {
    path: "/insights",
    label: "Insights",
    title: "Insights",
    icon: "Lightbulb",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "campaign insights library ava learning",
    group: "core",
  },
  {
    path: "/pacing",
    label: "Pacing",
    title: "Pacing",
    icon: "TrendingUp",
    inPalette: true,
    inSidebar: true,
    inBottomNav: true,
    roles: ["admin"],
    group: "core",
    // Index redirects to /pacing/overview — still a real route entry.
  },
  {
    path: "/tools/behavioural-planner",
    label: "Planning",
    title: "Planning",
    icon: "Compass",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "demand flow behavioural planner audience",
    group: "core",
  },
  {
    path: "/publishers",
    label: "Publishers",
    title: "Publishers",
    icon: "Building2",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    group: "core",
  },
  {
    path: "/client",
    label: "Clients",
    title: "Clients",
    icon: "Users",
    inPalette: true,
    inSidebar: true,
    sidebarExact: true,
    roles: ["admin"],
    searchTerms: "client hub",
    group: "core",
  },
  {
    path: "/finance",
    label: "Finance",
    title: "Finance",
    icon: "DollarSign",
    inPalette: false,
    inSidebar: false,
    inBottomNav: false,
    roles: ["admin"],
    group: "core",
    // FIN-1: bare /finance redirects to Clients billing (/finance/invoicing)
  },
  {
    path: "/knowledge",
    label: "Knowledge Hub",
    title: "Knowledge Hub",
    icon: "BookOpen",
    inPalette: true,
    inSidebar: true,
    roles: ["any"],
    searchTerms: "learning glossary definitions acronyms formulas",
    group: "core",
  },
  {
    path: "/mediaplans/create",
    label: "Create Campaign",
    title: "Create Campaign",
    icon: "PlusCircle",
    inPalette: true,
    inSidebar: false,
    inBottomNav: false,
    roles: ["admin"],
    searchTerms: "new media plan create campaign",
    group: "core",
    // Verb — not a sidebar noun. Reachable from /mediaplans CTA + palette.
  },
  {
    path: "/admin/users",
    label: "Users",
    title: "Users",
    icon: "Users",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "user management invite admin enrol enrolment users list",
    group: "admin",
  },
  {
    path: "/admin/users/new",
    label: "New user",
    title: "New user",
    icon: "UserCircle",
    inPalette: true,
    inSidebar: false,
    roles: ["admin"],
    searchTerms: "user management invite admin enrol enrolment new user",
    group: "admin",
  },
  {
    path: "/admin/m365-reconciliation",
    label: "M365 reconciliation",
    title: "M365 reconciliation",
    icon: "Cloud",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "microsoft sharepoint teams graph m365 reconciliation provisioning",
    group: "admin",
  },
  {
    path: "/admin/myhours-mapping",
    label: "MyHours mapping",
    title: "MyHours mapping",
    icon: "Clock",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "myhours time entries unmapped mapping hours",
    group: "admin",
  },
  {
    path: "/admin/fireflies-unattributed",
    label: "Fireflies meetings",
    title: "Fireflies meetings",
    icon: "MessageSquare",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms: "fireflies meetings transcripts unattributed assign domains clients publishers",
    group: "admin",
  },
  {
    path: "/admin/publisher-profiles",
    label: "Publisher profiles",
    title: "Publisher profiles",
    icon: "Layers",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms:
      "publisher profiles ingest schedule qms sca jcdecaux grid semantics legend",
    group: "admin",
  },
  {
    path: "/admin/schedule-ingest",
    label: "Schedule ingest",
    title: "Schedule ingest",
    icon: "Layers",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    searchTerms:
      "schedule ingest upload qms sca jcdecaux publisher review accept panels",
    group: "admin",
  },

  // ── Intermediate crumbs (no page — must not link) ──────────────────
  {
    path: "/tools",
    label: "Tools",
    title: "Tools",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/admin",
    label: "Admin",
    title: "Admin",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/mediaplans/mba",
    label: "MBA",
    title: "MBA",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/mediaplans/mba/[mba_number]",
    label: "MBA",
    title: "MBA",
    breadcrumbLabel: "MBA",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/mediaplans/[id]",
    label: "Campaign",
    title: "Campaign",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/pacing/admin",
    label: "Admin",
    title: "Pacing admin",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/finance/forecast",
    label: "Forecast",
    title: "Forecast",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },
  {
    path: "/finance/forecast/snapshots",
    label: "Snapshots",
    title: "Snapshots",
    inPalette: false,
    hasPage: false,
    group: "crumb",
  },

  // ── Campaign detail surfaces ───────────────────────────────────────
  {
    path: "/mediaplans/mba/[mba_number]/edit",
    label: "Edit Campaign",
    title: "Edit Campaign",
    inPalette: false,
    roles: ["admin"],
    group: "campaigns",
  },
  {
    path: "/mediaplans/[id]/edit",
    label: "Edit Campaign",
    title: "Edit Campaign",
    inPalette: false,
    roles: ["admin"],
    group: "campaigns",
  },
  {
    path: "/mediaplans/mba/[mba_number]/creative",
    label: "Creative",
    title: "Campaign Creative",
    inPalette: false,
    roles: ["admin"],
    group: "campaigns",
  },
  {
    path: "/mediaplans/mba/[mba_number]/trafficking",
    label: "Trafficking",
    title: "Trafficking",
    inPalette: false,
    roles: ["admin"],
    group: "campaigns",
  },

  // ── Dashboards (client + admin drill-down) ─────────────────────────
  {
    path: "/dashboard/[slug]",
    label: "Home",
    title: "Client Home",
    icon: "LayoutDashboard",
    inPalette: false,
    roles: ["any"],
    group: "dashboard",
  },
  {
    path: "/dashboard/[slug]/creative",
    label: "Creative",
    title: "Client Creative",
    icon: "Images",
    inPalette: false,
    roles: ["any"],
    group: "dashboard",
  },
  {
    path: "/dashboard/[slug]/[mba_number]",
    label: "Campaign",
    title: "Campaign dashboard",
    inPalette: false,
    roles: ["any"],
    group: "dashboard",
  },
  {
    path: "/client/[slug]",
    label: "Client dashboard",
    title: "Client dashboard",
    inPalette: false,
    roles: ["admin"],
    group: "dashboard",
  },

  // ── Pacing channels ────────────────────────────────────────────────
  {
    path: "/pacing/overview",
    label: "Overview",
    title: "Pacing · Overview",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
    searchTerms: "pacing overview",
  },
  {
    path: "/pacing/programmatic",
    label: "Programmatic",
    title: "Pacing · Programmatic",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
  },
  {
    path: "/pacing/social",
    label: "Social",
    title: "Pacing · Social",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
  },
  {
    path: "/pacing/search",
    label: "Search",
    title: "Pacing · Search",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
  },
  {
    path: "/pacing/direct",
    label: "Direct",
    title: "Pacing · Direct",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
  },
  {
    path: "/pacing/ad-serving",
    label: "Ad serving",
    title: "Pacing · Ad serving",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
  },
  {
    path: "/pacing/admin/orphans",
    label: "Orphans",
    title: "Pacing · Orphans",
    inPalette: true,
    roles: ["admin"],
    group: "pacing",
    searchTerms: "orphan line items",
  },

  // ── Finance children ───────────────────────────────────────────────
  {
    path: "/finance/forecast/snapshots/variance",
    label: "Variance",
    title: "Finance · Variance",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
  },
  {
    path: "/finance/receivables",
    label: "Receivables",
    title: "Receivables",
    inPalette: false,
    roles: ["admin"],
    group: "finance",
    // FN7 permanent redirect → /finance/invoicing
  },
  // Finance sections IA (FN7 + FIN-1). Staff-only; sidebar = four FINANCE items.
  {
    path: "/finance/home",
    label: "Finance home",
    title: "Finance",
    inPalette: false,
    roles: ["admin"],
    group: "finance",
    // Retired overview — permanent redirect → /finance/invoicing
  },
  {
    path: "/finance/invoicing",
    label: "Clients billing",
    title: "Finance · Clients billing",
    icon: "DollarSign",
    inPalette: true,
    inSidebar: true,
    inBottomNav: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "billing receivables invoicing clients billing finance",
  },
  {
    path: "/finance/periods",
    label: "Periods",
    title: "Finance · Periods",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "periods clients billing",
  },
  {
    path: "/finance/xero",
    label: "Xero",
    title: "Finance · Xero",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "xero queue match exceptions clients billing",
  },
  {
    path: "/finance/xero/matches",
    label: "Xero matches",
    title: "Finance · Xero matches",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "xero match pc6 divergence",
  },
  {
    path: "/finance/costs",
    label: "Publishers",
    title: "Finance · Publishers",
    icon: "Building2",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "costs payables publisher invoices accruals client-pays finance",
  },
  {
    path: "/finance/costs/invoices",
    label: "Publisher invoices",
    title: "Finance · Publisher invoices",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
  },
  {
    path: "/finance/costs/accruals",
    label: "Accruals",
    title: "Finance · Accruals",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
  },
  {
    path: "/finance/costs/client-pays",
    label: "Client-pays",
    title: "Finance · Client-pays",
    inPalette: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "client pays publisher direct excluded payables",
  },
  {
    path: "/finance/investment",
    label: "Investment",
    title: "Finance · Investment",
    icon: "Calculator",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "report spend margin finance",
  },
  {
    path: "/finance/forecasting",
    label: "Forecasting",
    title: "Finance · Forecasting",
    icon: "TrendingUp",
    inPalette: true,
    inSidebar: true,
    roles: ["admin"],
    group: "finance",
    searchTerms: "forecast booked targets variance finance",
  },

  // ── Scopes ─────────────────────────────────────────────────────────
  {
    path: "/scopes-of-work/create",
    label: "Create scope",
    title: "Create Scope of Work",
    inPalette: false,
    roles: ["admin"],
    group: "scopes",
  },
  {
    path: "/scopes-of-work/[id]",
    label: "Scope",
    title: "Scope of Work",
    inPalette: false,
    roles: ["admin"],
    group: "scopes",
  },
  {
    path: "/scopes-of-work/[id]/edit",
    label: "Edit scope",
    title: "Edit Scope of Work",
    inPalette: false,
    roles: ["admin"],
    group: "scopes",
  },

  // ── Publishers ─────────────────────────────────────────────────────
  {
    path: "/publishers/[publisherId]",
    label: "Publisher",
    title: "Publisher",
    inPalette: false,
    roles: ["admin"],
    group: "publishers",
  },

  // ── Knowledge Hub ──────────────────────────────────────────────────
  {
    path: "/knowledge/definitions",
    label: "Glossary",
    title: "Knowledge Hub · Glossary",
    breadcrumbLabel: "Glossary",
    icon: "BookOpen",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
    searchTerms: "definitions terms",
  },
  {
    path: "/knowledge/acronyms",
    label: "Acronyms",
    title: "Knowledge Hub · Acronyms",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/formulas",
    label: "Formulas",
    title: "Knowledge Hub · Formulas",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
    searchTerms: "cpm roas media math",
  },
  {
    path: "/knowledge/[section]",
    label: "Glossary",
    title: "Knowledge Hub · Glossary",
    inPalette: false,
    roles: ["any"],
    group: "knowledge",
    // Catch-all page file for definitions | acronyms | formulas
  },
  {
    path: "/knowledge/calculators",
    label: "Calculators",
    title: "Knowledge Hub · Calculators",
    icon: "Calculator",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/guides",
    label: "Guides",
    title: "Knowledge Hub · Guides",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/guides/[slug]",
    label: "Guide",
    title: "Knowledge Hub · Guide",
    inPalette: false,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/platforms",
    label: "Platforms",
    title: "Knowledge Hub · Platforms",
    icon: "Layers",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/platforms/[slug]",
    label: "Platform",
    title: "Knowledge Hub · Platform",
    inPalette: false,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/resources",
    label: "Resources",
    title: "Knowledge Hub · Resources",
    icon: "Globe",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
  },
  {
    path: "/knowledge/utm-builder",
    label: "UTM Builder",
    title: "Knowledge Hub · UTM Builder",
    icon: "Link2",
    inPalette: true,
    roles: ["any"],
    group: "knowledge",
  },

  // ── Account / profile / misc ───────────────────────────────────────
  {
    path: "/account",
    label: "Account",
    title: "Account",
    inPalette: true,
    roles: ["any"],
    group: "account",
  },
  {
    path: "/profile",
    label: "Profile",
    title: "Profile",
    inPalette: true,
    roles: ["any"],
    group: "account",
  },
  {
    path: "/support",
    label: "Support",
    title: "Support",
    inPalette: true,
    roles: ["any"],
    group: "account",
  },
  {
    path: "/admin/media-container-best-practice",
    label: "Media container best practice",
    title: "Media container best practice",
    inPalette: true,
    roles: ["admin"],
    group: "admin",
    searchTerms: "kpi best practice container",
  },
  // ── Error / gate pages (shared AccessDenied; routes kept for fail-closed redirects) ──
  {
    path: "/403",
    label: "Access denied",
    title: "Access denied",
    inPalette: false,
    group: "system",
  },
  {
    path: "/forbidden",
    label: "Forbidden",
    title: "Forbidden",
    inPalette: false,
    group: "system",
  },
  {
    path: "/unauthorized",
    label: "Unauthorized",
    title: "Unauthorized",
    inPalette: false,
    group: "system",
  },

  // ── Internal (dev-only; layout 404s in production) ─────────────────
  {
    path: "/chart-gallery",
    label: "Chart gallery",
    title: "Chart gallery",
    inPalette: false,
    roles: ["admin"],
    group: "internal",
  },
]

// ── Helpers ────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Convert `/mediaplans/mba/[mba_number]/edit` → regex matching concrete URLs. */
export function pathPatternToRegExp(pattern: string): RegExp {
  const parts = pattern.split("/").map((seg) => {
    if (!seg) return ""
    if (seg.startsWith("[[...") && seg.endsWith("]]")) return ".+"
    if (seg.startsWith("[...") && seg.endsWith("]")) return ".+"
    if (seg.startsWith("[") && seg.endsWith("]")) return "[^/]+"
    return escapeRegex(seg)
  })
  return new RegExp(`^${parts.join("/")}$`)
}

/** Prefer the most specific (longest pattern) match. */
export function matchRoute(pathname: string): RouteManifestEntry | null {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/"

  let best: RouteManifestEntry | null = null
  let bestLen = -1
  for (const entry of ROUTE_MANIFEST) {
    if (pathPatternToRegExp(entry.path).test(normalized)) {
      if (entry.path.length > bestLen) {
        best = entry
        bestLen = entry.path.length
      }
    }
  }
  return best
}

export function getRouteByExactPath(path: string): RouteManifestEntry | undefined {
  return ROUTE_MANIFEST.find((r) => r.path === path)
}

export function breadcrumbLabelForPath(pathname: string): string {
  const hit = matchRoute(pathname)
  if (hit) {
    const patternSegs = hit.path.split("/").filter(Boolean)
    const pathSegs = pathname.split("/").filter(Boolean)
    const lastPat = patternSegs[patternSegs.length - 1]
    if (
      lastPat?.startsWith("[") &&
      pathSegs.length === patternSegs.length &&
      /mba_number|publisherId|^\[id\]$|slug/.test(lastPat)
    ) {
      return pathSegs[pathSegs.length - 1]!
    }
    return hit.breadcrumbLabel ?? hit.label
  }
  const segment = pathname.split("/").filter(Boolean).pop() ?? pathname
  if (/^[A-Z0-9][-A-Z0-9_]+$/i.test(segment) && segment.length > 3) return segment
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function isLinkablePath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true
  const hit = matchRoute(pathname)
  if (!hit) {
    // Prefix hubs under known page trees (e.g. knowledge deep links already matched)
    return false
  }
  return hit.hasPage !== false
}

export function pageMetadata(path: string): { title: string } {
  const entry = getRouteByExactPath(path)
  if (!entry) {
    throw new Error(`pageMetadata: path not in ROUTE_MANIFEST: ${path}`)
  }
  return { title: entry.title }
}

export function resolveDocumentTitle(pathname: string): string {
  const hit = matchRoute(pathname)
  return hit?.title ?? "AssembledView"
}

function rolesAllow(entry: RouteManifestEntry, isAdmin: boolean): boolean {
  const roles = entry.roles ?? ["any"]
  if (roles.includes("any")) return true
  if (isAdmin && roles.includes("admin")) return true
  if (!isAdmin && roles.includes("client")) return true
  return false
}

export type NavLink = {
  path: string
  label: string
  icon?: RouteIconKey
  exact?: boolean
  searchTerms?: string
}

/** Admin primary sidebar rows — order from ADMIN_SIDEBAR_GROUPS. */
export function getAdminSidebarNav(): NavLink[] {
  return ADMIN_SIDEBAR_PATHS.map((path) => {
    const entry = getRouteByExactPath(path)
    if (!entry) throw new Error(`ADMIN_SIDEBAR_PATHS missing manifest entry: ${path}`)
    return {
      path: entry.path,
      label: entry.label,
      icon: entry.icon,
      exact: entry.sidebarExact,
      searchTerms: entry.searchTerms,
    }
  })
}

export function getAdminSidebarGroups(): Array<
  AdminSidebarGroup & { items: NavLink[] }
> {
  return ADMIN_SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.paths.map((path) => {
      const entry = getRouteByExactPath(path)
      if (!entry) throw new Error(`ADMIN_SIDEBAR_GROUPS missing manifest entry: ${path}`)
      return {
        path: entry.path,
        label: entry.label,
        icon: entry.icon,
        exact: entry.sidebarExact,
        searchTerms: entry.searchTerms,
      }
    }),
  }))
}

export function getAdminSidebarFooterNav(): NavLink[] {
  return ADMIN_SIDEBAR_FOOTER_PATHS.map((path) => {
    const entry = getRouteByExactPath(path)
    if (!entry) throw new Error(`ADMIN_SIDEBAR_FOOTER_PATHS missing manifest entry: ${path}`)
    return {
      path: entry.path,
      label: entry.label,
      icon: entry.icon,
      searchTerms: entry.searchTerms,
    }
  })
}

export function getAdminBottomNav(): NavLink[] {
  return ADMIN_BOTTOM_NAV_PATHS.map((path) => {
    const entry = getRouteByExactPath(path)
    if (!entry) throw new Error(`ADMIN_BOTTOM_NAV_PATHS missing manifest entry: ${path}`)
    return {
      path: entry.path,
      label: entry.label,
      icon: entry.icon,
      exact: entry.sidebarExact,
    }
  })
}

/**
 * Palette destinations. Admin: every `inPalette` entry allowed for admin.
 * Client: Knowledge Hub + account surfaces + their slug dashboard templates (resolved by caller).
 */
export function getPaletteNav(isAdmin: boolean): NavLink[] {
  return ROUTE_MANIFEST.filter((e) => e.inPalette && e.hasPage !== false && rolesAllow(e, isAdmin)).map(
    (e) => ({
      path: e.path,
      label: e.label,
      icon: e.icon,
      searchTerms: e.searchTerms,
    })
  )
}

/** Concrete palette paths for a client user (substitutes [slug]). */
export function getClientPaletteNav(userClient: string | null): NavLink[] {
  const items: NavLink[] = []
  if (userClient) {
    const home = getRouteByExactPath("/dashboard/[slug]")
    const creative = getRouteByExactPath("/dashboard/[slug]/creative")
    if (home) {
      items.push({
        path: `/dashboard/${userClient}`,
        label: home.label,
        icon: home.icon,
        searchTerms: "dashboard client",
      })
    }
    if (creative) {
      items.push({
        path: `/dashboard/${userClient}/creative`,
        label: creative.label,
        icon: creative.icon,
      })
    }
  }
  for (const path of ["/knowledge", "/account", "/profile", "/support"] as const) {
    const e = getRouteByExactPath(path)
    if (e?.inPalette) {
      items.push({ path: e.path, label: e.label, icon: e.icon, searchTerms: e.searchTerms })
    }
  }
  return items
}

/** App-router file path → manifest path (strip route groups). */
export function filePathToRoutePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/")
  const idx = normalized.indexOf("app/")
  const rel = idx >= 0 ? normalized.slice(idx + 4) : normalized
  const withoutPage = rel.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "")
  const noGroups = withoutPage
    .split("/")
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .join("/")
  return noGroups ? `/${noGroups}` : "/"
}
