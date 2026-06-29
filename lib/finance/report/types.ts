export type ReportDimension = "mediaType" | "publisher" | "buyType" | "format" | "station"

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
  totalBillable: number
  mediaSpend: number
  agencyFee: number
  clientPays: boolean
}
