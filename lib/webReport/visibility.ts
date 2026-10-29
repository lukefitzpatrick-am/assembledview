import "server-only"

import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { clientWebReports } from "@/db/schema"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { migration0098Applied } from "@/lib/webReport/builder/repo"
import { isWebSearchFlagOn } from "@/lib/webReport/featureFlag"

function clientIdFromRow(row: Record<string, unknown> | null): number | null {
  const raw = row?.id ?? row?.clients_id
  const id = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

/** True when the client behind this slug has a saved, published Web & search report. */
export async function isWebReportPublished(slug: string): Promise<boolean> {
  try {
    if (!(await migration0098Applied())) return false
    const clientId = clientIdFromRow(await fetchXanoClientRowByUrlSlug(slug))
    if (clientId == null) return false
    const [row] = await getDb()
      .select({ status: clientWebReports.status, currentVersion: clientWebReports.currentVersion })
      .from(clientWebReports)
      .where(eq(clientWebReports.clientId, clientId))
      .limit(1)
    return row?.status === "published" && (row.currentVersion ?? 0) > 0
  } catch (err) {
    console.warn("[web-search] published check failed; hiding the tab", err)
    return false
  }
}

/** The subset of a client user's slugs whose Web & search tab is visible. */
export async function publishedWebSearchSlugs(slugs: readonly string[]): Promise<string[]> {
  if (slugs.length === 0 || !(await isWebSearchFlagOn())) return []
  const checks = await Promise.all(slugs.map(async (slug) => ((await isWebReportPublished(slug)) ? slug : null)))
  return checks.filter((slug): slug is string => slug != null)
}
