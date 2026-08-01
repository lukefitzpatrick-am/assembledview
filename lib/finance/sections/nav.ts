/**
 * Finance sections routes + legacy hub tab equivalents (FN0 / FN1 / FIN-1).
 */

export type FinanceSectionNavItem = {
  path: string
  label: string
  /** Legacy hub `?tab=` this section replaces (redirect map). */
  legacyTab: string
  description: string
}

/** Four top-level sidebar items under FINANCE (FIN-1). */
export const FINANCE_SECTION_SIDEBAR_ITEMS: readonly FinanceSectionNavItem[] = [
  {
    path: "/finance/invoicing",
    label: "Clients billing",
    legacyTab: "billing",
    description: "Client billing, periods, and Xero",
  },
  {
    path: "/finance/costs",
    label: "Publishers",
    legacyTab: "payables",
    description: "Publisher invoices and accruals",
  },
  {
    path: "/finance/forecasting",
    label: "Forecasting",
    legacyTab: "forecast",
    description: "Booked, targets, and variance",
  },
  {
    path: "/finance/investment",
    label: "Investment",
    legacyTab: "report",
    description: "Spend and margin reporting",
  },
] as const

/**
 * In-page tabs for the Clients billing sidebar item (Invoicing | Periods | Xero).
 * Forecasting and Investment have no cross-section tab bar (FIN-1).
 */
export const CLIENTS_BILLING_TAB_ITEMS: readonly FinanceSectionNavItem[] = [
  {
    path: "/finance/invoicing",
    label: "Invoicing",
    legacyTab: "billing",
    description: "Client billing and receivables",
  },
  {
    path: "/finance/periods",
    label: "Periods",
    legacyTab: "overview",
    description: "Finance period rail and runs",
  },
  {
    path: "/finance/xero",
    label: "Xero",
    legacyTab: "queue",
    description: "Xero exceptions and PC6 matches",
  },
] as const

/** @deprecated Use CLIENTS_BILLING_TAB_ITEMS or financeSectionPillsForPath — FIN-1 retired the global pill row. */
export const FINANCE_SECTION_PILL_ITEMS: readonly FinanceSectionNavItem[] = [
  ...CLIENTS_BILLING_TAB_ITEMS,
] as const

/** Every product page path introduced by the sections scaffold (for manifest + tests). */
export const FINANCE_SECTION_PAGE_PATHS = [
  "/finance/home",
  "/finance/invoicing",
  "/finance/periods",
  "/finance/xero",
  "/finance/xero/matches",
  "/finance/costs",
  "/finance/costs/invoices",
  "/finance/costs/accruals",
  "/finance/costs/client-pays",
  "/finance/investment",
  "/finance/forecasting",
] as const

/**
 * Legacy hub `?tab=` → sections path (FN1 / FN7 / FIN-1 permanent redirects).
 * Overview retired → Clients billing (invoicing). `xero-queue` alias for hub tab `queue`.
 */
export const FINANCE_TAB_TO_SECTION_PATH: Readonly<Record<string, string>> = {
  overview: "/finance/invoicing",
  billing: "/finance/invoicing",
  payables: "/finance/costs/invoices",
  accrual: "/finance/costs/accruals",
  forecast: "/finance/forecasting",
  report: "/finance/investment",
  queue: "/finance/xero",
  "xero-queue": "/finance/xero",
}

/** Serializable sidebar model (FIN-1 — four FINANCE items). */
export type FinanceSidebarSnapshot = {
  mode: "expandable"
  label: "Finance"
  landingPath: "/finance/invoicing"
  items: ReadonlyArray<{ path: string; label: string }>
}

/** Sidebar is always the expandable sections model (flag kill-switch does not flatten). */
export function getFinanceSidebarSnapshot(_sectionsEnabled?: boolean): FinanceSidebarSnapshot {
  return {
    mode: "expandable",
    label: "Finance",
    landingPath: "/finance/invoicing",
    items: FINANCE_SECTION_SIDEBAR_ITEMS.map((i) => ({ path: i.path, label: i.label })),
  }
}

/** Canonical section path for a legacy hub `?tab=` value (FN1 map). */
export function sectionPathForFinanceTab(tab: string): string | null {
  return FINANCE_TAB_TO_SECTION_PATH[tab] ?? null
}

function normalizeFinancePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname || "/"
}

/** True when pathname belongs to the Clients billing sidebar item (incl. Periods / Xero). */
export function isClientsBillingPath(pathname: string): boolean {
  const p = normalizeFinancePath(pathname)
  return (
    p === "/finance/invoicing" ||
    p.startsWith("/finance/invoicing/") ||
    p === "/finance/periods" ||
    p.startsWith("/finance/periods/") ||
    p === "/finance/xero" ||
    p.startsWith("/finance/xero/")
  )
}

/** True when pathname belongs to the Publishers (costs) sidebar item. */
export function isPublishersFinancePath(pathname: string): boolean {
  const p = normalizeFinancePath(pathname)
  return p === "/finance/costs" || p.startsWith("/finance/costs/")
}

/**
 * In-shell tab pills for the current path.
 * Clients billing → Invoicing | Periods | Xero.
 * Periods is omitted when `periodsEnabled` is false (`FINANCE_PERIODS` off — FIN-8).
 * Publishers keeps CostsSubNav only (no shell pills).
 * Forecasting / Investment → none (dedicated sidebar items).
 */
export function financeSectionPillsForPath(
  pathname: string,
  opts?: { periodsEnabled?: boolean }
): readonly FinanceSectionNavItem[] {
  if (!isClientsBillingPath(pathname)) return []
  const periodsEnabled = opts?.periodsEnabled !== false
  if (periodsEnabled) return CLIENTS_BILLING_TAB_ITEMS
  return CLIENTS_BILLING_TAB_ITEMS.filter((item) => item.path !== "/finance/periods")
}

/**
 * Permanent redirect destinations for legacy finance paths (next.config + middleware).
 * Paths land on sections directly (no `?tab=` hop).
 */
export const FINANCE_LEGACY_PATH_REDIRECTS: ReadonlyArray<{
  source: string
  destination: string
}> = [
  { source: "/finance/billing", destination: "/finance/invoicing" },
  { source: "/finance/media", destination: "/finance/invoicing" },
  { source: "/finance/scopes", destination: "/finance/invoicing" },
  { source: "/finance/retainers", destination: "/finance/invoicing" },
  { source: "/finance/sow", destination: "/finance/invoicing" },
  { source: "/finance/receivables", destination: "/finance/invoicing" },
  { source: "/finance/home", destination: "/finance/invoicing" },
  { source: "/finance/publishers", destination: "/finance/costs/invoices" },
  { source: "/finance/accrual", destination: "/finance/costs/accruals" },
  { source: "/finance/forecast", destination: "/finance/forecasting" },
]
