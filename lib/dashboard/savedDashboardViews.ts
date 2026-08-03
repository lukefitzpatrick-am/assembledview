/**
 * Home / Campaigns shared saved-views storage (pinned clients).
 * Key: `dashboard:savedViews:v2:${userId}` — one pin set across both pages.
 */

import {
  executiveOverviewTemplate,
  getDashboardTemplateById,
  type DashboardTemplateMobileOpen,
  type DashboardTemplatePanels,
} from "@/components/dashboard/templates"
import {
  defaultDashboardViewFilters,
  type DashboardViewFilters,
} from "@/lib/dashboard/homeDashboardFilters"

export type SavedDashboardViewRecord = {
  id: string
  name: string
  filters: DashboardViewFilters
  templateId: string
  panels: DashboardTemplatePanels
  mobileOpen: DashboardTemplateMobileOpen
  createdAt: string
}

/** Canonical name for the client-pin saved view (legacy migrate used "Saved clients"). */
export const PINNED_CLIENTS_VIEW_NAME = "Pinned clients"
const LEGACY_PINNED_CLIENTS_VIEW_NAMES = new Set([PINNED_CLIENTS_VIEW_NAME, "Saved clients"])

export function savedViewsListKeyForUser(userId: string | null | undefined): string | null {
  const id = String(userId ?? "").trim()
  return id ? `dashboard:savedViews:v2:${id}` : null
}

export function legacyPinnedClientsKeyForUser(userId: string | null | undefined): string | null {
  const id = String(userId ?? "").trim()
  return id ? `dashboard:view:v1:${id}:clientFilters` : null
}

function normalizeDashboardTemplatePanels(raw: unknown): DashboardTemplatePanels {
  const d = executiveOverviewTemplate.panels
  if (!raw || typeof raw !== "object") return { ...d }
  const p = raw as Record<string, unknown>
  return {
    keyMetrics: Boolean(p.keyMetrics),
    spendBreakdown: Boolean(p.spendBreakdown),
    monthlyTrends: Boolean(p.monthlyTrends),
    liveCampaigns: Boolean(p.liveCampaigns),
    scopes: Boolean(p.scopes),
    dueSoon: Boolean(p.dueSoon),
    finishedRecently: Boolean(p.finishedRecently),
  }
}

function normalizeDashboardTemplateMobileOpen(raw: unknown): DashboardTemplateMobileOpen {
  const d = executiveOverviewTemplate.mobileOpen
  if (!raw || typeof raw !== "object") return { ...d }
  const p = raw as Record<string, unknown>
  return {
    monthlyTrends: Boolean(p.monthlyTrends),
    scopes: Boolean(p.scopes),
    dueSoon: Boolean(p.dueSoon),
    finishedRecently: Boolean(p.finishedRecently),
  }
}

function normalizeSavedDashboardViewEntry(x: unknown): SavedDashboardViewRecord | null {
  if (!x || typeof x !== "object") return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== "string" || typeof o.name !== "string") return null
  const f = o.filters
  if (!f || typeof f !== "object" || Array.isArray(f)) return null
  const fr = f as Record<string, unknown>
  const filters: DashboardViewFilters = {
    campaignSearch: typeof fr.campaignSearch === "string" ? fr.campaignSearch : "",
    clients: Array.isArray(fr.clients) ? fr.clients.map((c) => String(c)).filter(Boolean) : [],
    publishers: Array.isArray(fr.publishers) ? fr.publishers.map((p) => String(p)).filter(Boolean) : [],
    month: typeof fr.month === "string" && fr.month.trim() ? fr.month.trim() : null,
  }
  const templateId =
    typeof o.templateId === "string" && getDashboardTemplateById(o.templateId)
      ? o.templateId
      : executiveOverviewTemplate.id
  return {
    id: o.id,
    name: o.name,
    filters,
    templateId,
    panels: normalizeDashboardTemplatePanels(o.panels),
    mobileOpen: normalizeDashboardTemplateMobileOpen(o.mobileOpen),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
  }
}

export function parseSavedViewsFromStorageJson(raw: string | null): SavedDashboardViewRecord[] {
  if (!raw) return []
  try {
    const p = JSON.parse(raw) as unknown
    if (Array.isArray(p)) {
      return p
        .map(normalizeSavedDashboardViewEntry)
        .filter((v): v is SavedDashboardViewRecord => v != null)
    }
    if (p && typeof p === "object" && Array.isArray((p as { views?: unknown }).views)) {
      return ((p as { views: unknown[] }).views || [])
        .map(normalizeSavedDashboardViewEntry)
        .filter((v): v is SavedDashboardViewRecord => v != null)
    }
  } catch {
    // ignore
  }
  return []
}

export function serializeSavedViewsToStorageJson(views: SavedDashboardViewRecord[]): string {
  return JSON.stringify({ views })
}

export function findPinnedClientsView(
  views: SavedDashboardViewRecord[],
): SavedDashboardViewRecord | undefined {
  return views.find((v) => LEGACY_PINNED_CLIENTS_VIEW_NAMES.has(v.name))
}

export function readClientsFromLegacyPinKey(key: string | null): string[] {
  if (!key) return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map((v) => (typeof v === "string" ? v : "")).filter(Boolean)
      : []
  } catch {
    return []
  }
}

export function cloneDashboardViewFilters(f: DashboardViewFilters): DashboardViewFilters {
  return {
    campaignSearch: f.campaignSearch,
    clients: [...f.clients],
    publishers: [...f.publishers],
    month: f.month,
  }
}

/** Upsert the Pinned clients view with the given client keys. */
export function upsertPinnedClientsView(
  views: SavedDashboardViewRecord[],
  clients: string[],
  defaults?: {
    templateId?: string
    panels?: DashboardTemplatePanels
    mobileOpen?: DashboardTemplateMobileOpen
  },
): SavedDashboardViewRecord[] {
  const existing = findPinnedClientsView(views)
  const nextRecord: SavedDashboardViewRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    name: PINNED_CLIENTS_VIEW_NAME,
    filters: {
      ...(existing ? cloneDashboardViewFilters(existing.filters) : defaultDashboardViewFilters()),
      clients: [...clients],
    },
    templateId: existing?.templateId ?? defaults?.templateId ?? executiveOverviewTemplate.id,
    panels: existing
      ? { ...existing.panels }
      : { ...(defaults?.panels ?? executiveOverviewTemplate.panels) },
    mobileOpen: existing
      ? { ...existing.mobileOpen }
      : { ...(defaults?.mobileOpen ?? executiveOverviewTemplate.mobileOpen) },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  return existing
    ? views.map((v) => (v.id === existing.id ? nextRecord : v))
    : [...views, nextRecord]
}
