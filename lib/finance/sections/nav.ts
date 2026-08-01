/**
 * Finance sections routes + legacy hub tab equivalents (FN0 / FN1).
 */

export type FinanceSectionNavItem = {
  path: string
  label: string
  /** Legacy hub `?tab=` this section replaces (redirect map). */
  legacyTab: string
  description: string
}

/** Four top-level sections in the sidebar expandable. */
export const FINANCE_SECTION_SIDEBAR_ITEMS: readonly FinanceSectionNavItem[] = [
  {
    path: "/finance/invoicing",
    label: "Invoicing",
    legacyTab: "billing",
    description: "Client billing and receivables",
  },
  {
    path: "/finance/costs",
    label: "Costs",
    legacyTab: "payables",
    description: "Publisher invoices and accruals",
  },
  {
    path: "/finance/investment",
    label: "Investment",
    legacyTab: "report",
    description: "Spend and margin reporting",
  },
  {
    path: "/finance/forecasting",
    label: "Forecasting",
    legacyTab: "forecast",
    description: "Booked, targets, and variance",
  },
] as const

/** Pill-row destinations inside the sections shell (includes landing + support routes). */
export const FINANCE_SECTION_PILL_ITEMS: readonly FinanceSectionNavItem[] = [
  {
    path: "/finance",
    label: "Overview",
    legacyTab: "overview",
    description: "Finance home",
  },
  ...FINANCE_SECTION_SIDEBAR_ITEMS,
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
 * Legacy hub `?tab=` → sections path (FN1 / FN7 permanent redirects).
 * `xero-queue` accepted as an alias for hub tab `queue`.
 */
export const FINANCE_TAB_TO_SECTION_PATH: Readonly<Record<string, string>> = {
  overview: "/finance",
  billing: "/finance/invoicing",
  payables: "/finance/costs/invoices",
  accrual: "/finance/costs/accruals",
  forecast: "/finance/forecasting",
  report: "/finance/investment",
  queue: "/finance/xero",
  "xero-queue": "/finance/xero",
}

/** Serializable sidebar model (FN7 — always expandable sections). */
export type FinanceSidebarSnapshot = {
  mode: "expandable"
  label: "Finance"
  landingPath: "/finance"
  items: ReadonlyArray<{ path: string; label: string }>
}

/** FN7: sidebar is always the expandable sections model (flag kill-switch does not flatten). */
export function getFinanceSidebarSnapshot(_sectionsEnabled?: boolean): FinanceSidebarSnapshot {
  return {
    mode: "expandable",
    label: "Finance",
    landingPath: "/finance",
    items: FINANCE_SECTION_SIDEBAR_ITEMS.map((i) => ({ path: i.path, label: i.label })),
  }
}

/** Canonical section path for a legacy hub `?tab=` value (FN1 map). */
export function sectionPathForFinanceTab(tab: string): string | null {
  return FINANCE_TAB_TO_SECTION_PATH[tab] ?? null
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
  { source: "/finance/publishers", destination: "/finance/costs/invoices" },
  { source: "/finance/accrual", destination: "/finance/costs/accruals" },
  { source: "/finance/forecast", destination: "/finance/forecasting" },
]
