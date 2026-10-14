import "server-only"

import { and, desc, eq, lte } from "drizzle-orm"

import { getDb } from "@/db"
import { clientWebReportVersions, clientWebReports, migrationMarkers } from "@/db/schema"
import { getClientDashboardData } from "@/lib/api/dashboard"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import {
  listActivePlatformAccounts,
  PlatformAccountsNotReadyError,
} from "@/lib/clients/platformAccountsRepo"
import { isPlannedBasisCampaignStatus } from "@/lib/dashboard/plannedSpendConsistency"
import { MIGRATION_0098_KEY, normaliseGa4PropertyRef, parseLayout, planSave } from "@/lib/webReport/builder/layout"
import { loadWebReportData } from "@/lib/webReport/data/load"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"
import { windowsForRequest } from "@/lib/webReport/loadPage"
import { isReportPeriod, type ReportPeriod } from "@/lib/webReport/periods"
import { field, isMissingMartView, text } from "@/lib/webReport/rows"
import { querySnowflake } from "@/lib/snowflake/query"
import type { WebReportData } from "@/lib/webReport/types"
import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"

export class BuilderMigrationError extends Error {
  constructor() {
    super("Builder needs migration 0098")
    this.name = "BuilderMigrationError"
  }
}

export type BuilderOption = { value: string; label: string }

export type BuilderVersionRow = { version: number; savedAt: string | null }

export type BuilderDraft = {
  clientId: number
  clientName: string
  migrationApplied: boolean
  layout: WebReportLayoutItem[]
  currentVersion: number
  versions: BuilderVersionRow[]
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  ga4Options: BuilderOption[]
  gscOptions: BuilderOption[]
  keyEventNames: string[]
}

function clientIdFromRow(row: Record<string, unknown> | null): number | null {
  const raw = row?.id ?? row?.clients_id
  const id = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function migration0098Applied(): Promise<boolean> {
  try {
    const db = getDb()
    const [row] = await db
      .select({ key: migrationMarkers.key })
      .from(migrationMarkers)
      .where(eq(migrationMarkers.key, MIGRATION_0098_KEY))
      .limit(1)
    return Boolean(row)
  } catch (err) {
    console.warn("[web-builder] could not read migration_markers", err)
    return false
  }
}

export async function resolveBuilderClient(
  slug: string,
): Promise<{ clientId: number; clientName: string } | null> {
  const [dashboard, clientRow] = await Promise.all([
    getClientDashboardData(slug),
    fetchXanoClientRowByUrlSlug(slug),
  ])
  if (!dashboard) return null
  const clientId = clientIdFromRow(clientRow)
  if (clientId == null) return null
  return { clientId, clientName: dashboard.clientName }
}

async function distinctColumn(sqlText: string, viewName: string, column: string): Promise<string[]> {
  try {
    const rows = await querySnowflake<Record<string, unknown>>(sqlText, [], { label: viewName })
    const values: string[] = []
    const seen = new Set<string>()
    for (const row of rows ?? []) {
      const value = text(field(row, column))
      if (!value || seen.has(value)) continue
      seen.add(value)
      values.push(value)
    }
    return values
  } catch (err) {
    if (!isMissingMartView(err, viewName)) {
      console.warn(`[web-builder] ${viewName} list failed`, err)
    }
    return []
  }
}

async function platformRefs(clientId: number): Promise<{ ga4: string[]; gsc: string[] }> {
  try {
    const accounts = await listActivePlatformAccounts(clientId)
    return {
      ga4: accounts.flatMap((account) => {
        if (account.platform !== "ga4") return []
        const ref = normaliseGa4PropertyRef(account.accountRef)
        return ref ? [ref] : []
      }),
      gsc: accounts.flatMap((account) => {
        if (account.platform !== "gsc") return []
        const site = account.accountRef?.trim()
        return site ? [site] : []
      }),
    }
  } catch (err) {
    if (!(err instanceof PlatformAccountsNotReadyError)) {
      console.warn("[web-builder] platform accounts unavailable", err)
    }
    return { ga4: [], gsc: [] }
  }
}

function mergeOptions(linked: string[], discovered: string[], normalise: (value: string) => string | null): BuilderOption[] {
  const options = new Map<string, string>()
  for (const raw of linked) {
    const value = normalise(raw)
    if (value) options.set(value, `${value} (linked)`)
  }
  for (const raw of discovered) {
    const value = normalise(raw)
    if (value && !options.has(value)) options.set(value, value)
  }
  return [...options.entries()].map(([value, label]) => ({ value, label }))
}

/** Distinct event names from V_GA4_EVENTS_DAILY for one property. */
export async function listKeyEventNames(propertyId: string | null): Promise<string[]> {
  if (!propertyId) return []
  try {
    const rows = await querySnowflake<Record<string, unknown>>(
      `SELECT DISTINCT event_name
       FROM ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY
       WHERE property_id = ?
         AND event_name IS NOT NULL
       ORDER BY event_name
       LIMIT 200`,
      [propertyId],
      { label: "V_GA4_EVENTS_DAILY" },
    )
    const names: string[] = []
    const seen = new Set<string>()
    for (const row of rows ?? []) {
      const name = text(field(row, "event_name"))
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
    return names
  } catch (err) {
    if (!isMissingMartView(err, "V_GA4_EVENTS_DAILY")) {
      console.warn("[web-builder] V_GA4_EVENTS_DAILY list failed", err)
    }
    return []
  }
}

export async function loadBuilderDraft(
  slug: string,
  fallbackLayout: WebReportLayoutItem[],
): Promise<BuilderDraft | null> {
  const client = await resolveBuilderClient(slug)
  if (!client) return null
  const applied = await migration0098Applied()
  const accounts = await platformRefs(client.clientId)
  const [ga4Properties, gscSites] = await Promise.all([
    distinctColumn(
      `SELECT DISTINCT property_id
       FROM ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY
       WHERE property_id IS NOT NULL
       ORDER BY property_id
       LIMIT 200`,
      "V_GA4_CAMPAIGN_DAILY",
      "property_id",
    ),
    distinctColumn(
      `SELECT DISTINCT site
       FROM ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY
       WHERE site IS NOT NULL
       ORDER BY site
       LIMIT 200`,
      "V_GSC_SITE_DAILY",
      "site",
    ),
  ])

  let layout = fallbackLayout
  let currentVersion = 0
  let versions: BuilderVersionRow[] = []
  let ga4PropertyRef = accounts.ga4[0] ?? null
  let gscSiteRef = accounts.gsc[0] ?? null
  let brandTerms: string[] = []
  let defaultPeriod: ReportPeriod = "last_month"

  if (applied) {
    try {
      const db = getDb()
      const [report] = await db
        .select()
        .from(clientWebReports)
        .where(eq(clientWebReports.clientId, client.clientId))
        .limit(1)
      if (report) {
        currentVersion = report.currentVersion
        ga4PropertyRef = normaliseGa4PropertyRef(report.ga4PropertyRef) ?? ga4PropertyRef
        gscSiteRef = report.gscSiteRef?.trim() || gscSiteRef
        brandTerms = report.brandTerms ?? []
        defaultPeriod = isReportPeriod(report.defaultPeriod) ? report.defaultPeriod : "last_month"
        const rows = await db
          .select({
            version: clientWebReportVersions.version,
            savedAt: clientWebReportVersions.savedAt,
            layout: clientWebReportVersions.layout,
          })
          .from(clientWebReportVersions)
          .where(eq(clientWebReportVersions.reportId, report.id))
          .orderBy(desc(clientWebReportVersions.version))
          .limit(10)
        versions = rows.map((row) => ({ version: row.version, savedAt: row.savedAt }))
        const current = rows.find((row) => row.version === report.currentVersion) ?? rows[0]
        const cleaned = current ? parseLayout(current.layout) : null
        if (cleaned?.ok) layout = cleaned.layout
      }
    } catch (err) {
      console.warn("[web-builder] saved report unavailable", err)
    }
  }

  return {
    clientId: client.clientId,
    clientName: client.clientName,
    migrationApplied: applied,
    layout,
    currentVersion,
    versions,
    ga4PropertyRef,
    gscSiteRef,
    brandTerms,
    defaultPeriod,
    ga4Options: mergeOptions(accounts.ga4, ga4Properties, (value) => normaliseGa4PropertyRef(value)),
    gscOptions: mergeOptions(accounts.gsc, gscSites, (value) => {
      const site = value.trim()
      return site.length > 0 ? site : null
    }),
    keyEventNames: await listKeyEventNames(ga4PropertyRef),
  }
}

type SaveInput = {
  clientId: number
  layout: WebReportLayoutItem[]
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  savedBy: string | null
}

export async function savePublishedReport(input: SaveInput): Promise<{ version: number }> {
  if (!(await migration0098Applied())) throw new BuilderMigrationError()
  const db = getDb()
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(clientWebReports)
      .where(eq(clientWebReports.clientId, input.clientId))
      .limit(1)
    const { nextVersion, dropAtOrBelow } = planSave(existing?.currentVersion ?? 0)
    const stamp = new Date().toISOString()
    const values = {
      status: "published" as const,
      currentVersion: nextVersion,
      ga4PropertyRef: input.ga4PropertyRef,
      gscSiteRef: input.gscSiteRef,
      brandTerms: input.brandTerms,
      defaultPeriod: input.defaultPeriod,
      updatedAt: stamp,
      updatedBy: input.savedBy,
    }
    let reportId = existing?.id
    if (!existing) {
      const [created] = await tx
        .insert(clientWebReports)
        .values({ clientId: input.clientId, ...values })
        .returning({ id: clientWebReports.id })
      reportId = created?.id
    } else {
      await tx.update(clientWebReports).set(values).where(eq(clientWebReports.id, existing.id))
    }
    if (reportId == null) throw new Error("Report was not saved")
    await tx.insert(clientWebReportVersions).values({
      reportId,
      version: nextVersion,
      layout: input.layout,
      savedBy: input.savedBy,
    })
    if (dropAtOrBelow != null) {
      await tx
        .delete(clientWebReportVersions)
        .where(
          and(
            eq(clientWebReportVersions.reportId, reportId),
            lte(clientWebReportVersions.version, dropAtOrBelow),
          ),
        )
    }
    return { version: nextVersion }
  })
}

export async function restorePublishedVersion(input: {
  clientId: number
  version: number
  savedBy: string | null
}): Promise<{ version: number; layout: WebReportLayoutItem[] } | null> {
  if (!(await migration0098Applied())) throw new BuilderMigrationError()
  const db = getDb()
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(clientWebReports)
      .where(eq(clientWebReports.clientId, input.clientId))
      .limit(1)
    if (!report) return null
    const [version] = await tx
      .select()
      .from(clientWebReportVersions)
      .where(
        and(
          eq(clientWebReportVersions.reportId, report.id),
          eq(clientWebReportVersions.version, input.version),
        ),
      )
      .limit(1)
    if (!version) return null
    await tx
      .update(clientWebReports)
      .set({
        status: "published",
        currentVersion: version.version,
        updatedAt: new Date().toISOString(),
        updatedBy: input.savedBy,
      })
      .where(eq(clientWebReports.id, report.id))
    const layout = Array.isArray(version.layout) ? (version.layout as WebReportLayoutItem[]) : []
    return { version: version.version, layout }
  })
}

export async function loadBuilderPreview(input: {
  slug: string
  period: ReportPeriod
  ga4PropertyId: string | null
  gscSite: string | null
  brandTerms: string[]
}): Promise<{ clientName: string; connected: boolean; data: WebReportData } | null> {
  const dashboard = await getClientDashboardData(input.slug)
  if (!dashboard) return null
  const today = sydneyYmdFromUtcInstant(new Date())
  const windows = windowsForRequest({ period: input.period, today })
  const campaigns = [
    ...dashboard.liveCampaignsList,
    ...dashboard.planningCampaignsList,
    ...dashboard.completedCampaignsList,
  ]
    .filter((campaign) => isPlannedBasisCampaignStatus(campaign.status))
    .map((campaign) => ({
      mbaNumber: campaign.mbaNumber,
      versionNumber: Number.isFinite(campaign.version_number) ? campaign.version_number : undefined,
      mediaTypes: campaign.mediaTypes,
      planClientName: campaign.planClientName,
    }))
  const data = await loadWebReportData({
    windows,
    today,
    ga4PropertyId: input.ga4PropertyId,
    gscSite: input.gscSite,
    brandTerms: input.brandTerms,
    campaigns,
  })
  return {
    clientName: dashboard.clientName,
    connected: Boolean(input.ga4PropertyId || input.gscSite),
    data,
  }
}
