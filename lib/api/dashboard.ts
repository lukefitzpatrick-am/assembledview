/**
 * Public API barrel for lib/api/dashboard.
 */
export {
  getClientBySlug,
  getClientDashboardData,
  getClientHubSummaries,
  getClientHubSummariesForAdminHub,
  exportDashboardData,
  getSpendByMediaTypeData,
  getSpendByCampaignData,
  getMonthlySpendData,
  fetchVersionsForMba,
  mapMbaCampaignResponseVersionsToListEntries,
  type MediaPlanVersionListEntry,
} from "./dashboard/client"

export { getPublisherDashboardData } from "./dashboard/publisher"

export {
  getGlobalMonthlySpend,
  getGlobalMonthlyPublisherSpend,
  getGlobalMonthlyClientSpend,
} from "./dashboard/global"

export { getFinanceHubScheduleFytdTotals } from "./dashboard/finance"
