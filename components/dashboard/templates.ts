import { format } from "date-fns"

/** Mirrors dashboard filter state on the overview (kept here to avoid a circular import). */
export type DashboardTemplateFilters = {
  campaignSearch: string
  clients: string[]
  publishers: string[]
  month: string | null
}

export type DashboardTimeRangePreset =
  | "current_fy"
  /** Sets the billing `monthYear` month filter to the current calendar month (e.g. March 2025). */
  | "this_calendar_month"
  | "all_time"

export type DashboardTemplatePanels = {
  keyMetrics: boolean
  spendBreakdown: boolean
  monthlyTrends: boolean
  liveCampaigns: boolean
  scopes: boolean
  dueSoon: boolean
  finishedRecently: boolean
}

export type DashboardTemplateMobileOpen = {
  monthlyTrends: boolean
  scopes: boolean
  dueSoon: boolean
  finishedRecently: boolean
}

export type DashboardTemplate = {
  id: string
  label: string
  description: string
  filters: DashboardTemplateFilters
  panels: DashboardTemplatePanels
  mobileOpen: DashboardTemplateMobileOpen
  timeRange: DashboardTimeRangePreset
}

export function describeDashboardTimeRange(preset: DashboardTimeRangePreset, now: Date = new Date()): string {
  switch (preset) {
    case "current_fy":
      return ""
    case "this_calendar_month":
      return `Time range: this calendar month (${format(now, "MMMM yyyy")}) — month filter applied to tables and billing.`
    case "all_time":
      return "Time range: all periods — no month filter."
  }
}

export function buildFiltersForTemplate(template: DashboardTemplate, now: Date = new Date()): DashboardTemplateFilters {
  const base: DashboardTemplateFilters = { ...template.filters }
  if (template.timeRange === "this_calendar_month") {
    return { ...base, month: format(now, "MMMM yyyy") }
  }
  return { ...base, month: base.month }
}

export const executiveOverviewTemplate: DashboardTemplate = {
  id: "executive-overview",
  label: "Executive overview",
  description: "Full metrics, spend mix, monthly trends, and all operational tables.",
  filters: {
    campaignSearch: "",
    clients: [],
    publishers: [],
    month: null,
  },
  panels: {
    keyMetrics: true,
    spendBreakdown: true,
    monthlyTrends: true,
    liveCampaigns: true,
    scopes: true,
    dueSoon: true,
    finishedRecently: true,
  },
  mobileOpen: {
    monthlyTrends: true,
    scopes: false,
    dueSoon: false,
    finishedRecently: false,
  },
  timeRange: "current_fy",
}

export const publisherPerformanceTemplate: DashboardTemplate = {
  id: "publisher-performance",
  label: "Publisher performance",
  description: "Publisher spend split, monthly publisher trends, and live campaigns.",
  filters: {
    campaignSearch: "",
    clients: [],
    publishers: [],
    month: null,
  },
  panels: {
    keyMetrics: true,
    spendBreakdown: true,
    monthlyTrends: true,
    liveCampaigns: true,
    scopes: false,
    dueSoon: false,
    finishedRecently: false,
  },
  mobileOpen: {
    monthlyTrends: true,
    scopes: false,
    dueSoon: false,
    finishedRecently: false,
  },
  timeRange: "current_fy",
}

export const clientDeliveryTemplate: DashboardTemplate = {
  id: "client-delivery",
  label: "Client delivery",
  description: "Client spend context, monthly client trends, live campaigns, scopes, and upcoming starts.",
  filters: {
    campaignSearch: "",
    clients: [],
    publishers: [],
    month: null,
  },
  panels: {
    keyMetrics: true,
    spendBreakdown: true,
    monthlyTrends: true,
    liveCampaigns: true,
    scopes: true,
    dueSoon: true,
    finishedRecently: false,
  },
  mobileOpen: {
    monthlyTrends: true,
    scopes: true,
    dueSoon: false,
    finishedRecently: false,
  },
  timeRange: "this_calendar_month",
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  executiveOverviewTemplate,
  publisherPerformanceTemplate,
  clientDeliveryTemplate,
]

export function getDashboardTemplateById(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id)
}
