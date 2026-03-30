import axios from "axios"
import { campaignOverlapsMonth } from "@/lib/finance/utils"
import { xanoUrl } from "@/lib/api/xano"

export type RelevantVersionsResult = {
  year: number
  month: number
  allVersions: any[]
  relevantVersions: any[]
}

/**
 * Latest media plan versions whose campaign dates overlap the given calendar month.
 * Shared by finance API routes (media billing, publisher invoices, etc.).
 */
export async function fetchRelevantPlanVersionsForFinanceMonth(
  monthParam: string
): Promise<RelevantVersionsResult | { error: string; status: number }> {
  const [year, month] = monthParam.split("-").map(Number)
  if (!year || !month || month < 1 || month > 12) {
    return { error: "Invalid month format. Use YYYY-MM", status: 400 }
  }

  const mastersResponse = await axios.get(
    xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  )
  const masters = Array.isArray(mastersResponse.data) ? mastersResponse.data : []

  const mbaToVersionMap = new Map<string, { masterId?: number; versionNumber: number }>()
  masters.forEach((master: any) => {
    if (master.mba_number && master.version_number) {
      const versionNumber = Number(master.version_number) || 0
      const existing = mbaToVersionMap.get(master.mba_number)
      if (!existing || versionNumber > existing.versionNumber) {
        mbaToVersionMap.set(master.mba_number, {
          masterId: master.id,
          versionNumber,
        })
      }
    }
  })

  const versionsResponse = await axios.get(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  )
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  allVersions.forEach((version: any) => {
    if (!version.mba_number) return
    const versionNumber = Number(version.version_number) || 0
    const existing = mbaToVersionMap.get(version.mba_number)
    if (!existing || versionNumber > existing.versionNumber) {
      mbaToVersionMap.set(version.mba_number, {
        masterId: version.media_plan_master_id,
        versionNumber,
      })
    }
  })

  const relevantVersions = allVersions.filter((version: any) => {
    if (!version.mba_number) return false
    const versionInfo = mbaToVersionMap.get(version.mba_number)
    if (!versionInfo) return false

    const isLatestVersionNumber = Number(version.version_number) === Number(versionInfo.versionNumber)
    const masterIdMatches =
      !version.media_plan_master_id ||
      !versionInfo.masterId ||
      version.media_plan_master_id === versionInfo.masterId

    if (!isLatestVersionNumber || !masterIdMatches) return false

    if (version.campaign_start_date && version.campaign_end_date) {
      return campaignOverlapsMonth(version.campaign_start_date, version.campaign_end_date, year, month)
    }
    return false
  })

  return { year, month, allVersions, relevantVersions }
}
