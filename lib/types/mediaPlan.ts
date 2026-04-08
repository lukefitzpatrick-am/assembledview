/**
 * Persisted JSON under `media_plan_versions.deliverySchedule` / `delivery_schedule`:
 * month rows → `mediaTypes[]` → `lineItems[]`.
 */
export interface DeliveryScheduleLineItem {
  lineItemId?: string
  header1?: string
  header2?: string
  amount?: string | number
  /**
   * When true, the publisher invoices the client directly. Delivery/pacing views should still show the line; payables must exclude it.
   */
  clientPaysForMedia?: boolean
  client_pays_for_media?: boolean
}
