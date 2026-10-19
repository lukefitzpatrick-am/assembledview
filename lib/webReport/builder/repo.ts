import "server-only"

import { and, desc, eq, lte } from "drizzle-orm"

import { getDb } from "@/db"
import { clientWebReportVersions, clientWebReports, migrationMarkers } from "@/db/schema"
import { getClientDashboardData } from "@/lib/api/dashboard"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { isPlannedBasisCampaignStatus } from "@/lib/dashboard/plannedSpendConsistency"
import { MIGRATION_0098_KEY, parseLayout, planSave } from "@/lib/webReport/builder/layout"
import { loadWebReportData } from "@/lib/webReport/data/load"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"
import { loadReportAccounts, windowsForRequest } from "@/lib/webReport/loadPage"
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

export type BuilderVersionRow = { version: number; savedAt: string | null }

export type BuilderDraft = {
  clientId: number
  clientName: string
  migrationApplied: boolean
  layout: WebReportLayoutItem[]
  currentVersion: number
  versions: BuilderVersionRow[]
  /** Read only. From client_platform_accounts, never from the saved report. */
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  brandTerms: string[]
  defaultPeriod: ReportPeriod
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
  const accounts = await loadReportAccounts(client.clientId)

  let layout = fallbackLayout
  let currentVersion = 0
  let versions: BuilderVersionRow[] = []
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
    ga4PropertyRef: accounts.ga4PropertyId,
    gscSiteRef: accounts.gscSite,
    brandTerms,
    defaultPeriod,
    keyEventNames: await listKeyEventNames(accounts.ga4PropertyId),
  }
}

type SaveInput = {
  clientId: number
  layout: WebReportLayoutItem[]
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
  clientId: number
  period: ReportPeriod
  brandTerms: string[]
}): Promise<{ clientName: string; connected: boolean; data: WebReportData } | null> {
  const [dashboard, accounts] = await Promise.all([
    getClientDashboardData(input.slug),
    loadReportAccounts(input.clientId),
  ])
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
    ga4PropertyId: accounts.ga4PropertyId,
    ga4PropertyName: accounts.ga4PropertyName,
    gscSite: accounts.gscSite,
    brandTerms: input.brandTerms,
    campaigns,
    clientId: input.clientId,
  })
  return {
    clientName: dashboard.clientName,
    connected: Boolean(accounts.ga4PropertyId || accounts.gscSite),
    data,
  }
}
