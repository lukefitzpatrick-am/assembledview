export type ReportDimension =
  | "mediaType"
  | "publisher"
  | "buyType"
  | "format"
  | "station"
  | "client"
  | "billingMonth"
  | "financialYear"
  | "mbaNumber"
  | "billingType"
  | "billingStatus"
  | "rowKind"
  | "clientPays"
  | "billingAgency"

export interface ReportRow {
  mbaNumber: string
  billingMonth: string
  client: string
  mediaType: string
  publisher: string
  buyType: string
  format: string
  station: string
  rowKind: "media" | "service"
  serviceType?: "production" | "adServing" | string
  billingType: string
  billingStatus: string
  /** AA/AM from publishers.billingagency lookup; unmatched defaults to AM. */
  billingAgency: "AA" | "AM"
  totalBillable: number
  mediaSpend: number
  agencyFee: number
  clientPays: boolean
}
