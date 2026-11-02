/**
 * The published-tip pointer shape (`media_plan_masters.published_version_id`)
 * used by `publishedVersionPointerAudit.ts`.
 *
 * The X7 parity filter that sat here (`filterXanoItemsToPublishedTips`, which
 * tip-scoped crawled Xano rows) had no app caller after B6 and went in B8.
 */

export type PublishedTipPointer = {
  mba_number: string
  master_id: number
  published_version_id: number
  version_number: number
  published_campaign_status: string | null
}
