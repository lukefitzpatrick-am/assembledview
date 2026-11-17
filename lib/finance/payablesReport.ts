
/**
 * One delivery-schedule line for the selected month (amount &gt; 0).
 * `clientPaysForMedia`: publisher invoices the client directly — excluded from agency payables totals but surfaced in UI.
 */
export type PayableDeliveryExtract = {
  publisherName: string
  mediaType: string
  /** Human-readable line detail (header / targeting), for grids and exports. */
  description: string
  amount: number
  mbaNumber: string
  clientId: number
  campaignName: string
  clientPaysForMedia: boolean
}

/** Version-level fields applied to every row returned for that schedule. */
export type PayableScheduleMeta = {
  mbaNumber: string
  clientId: number
  campaignName: string
}
