import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CSVExportButton } from "@/components/ui/csv-export-button"

type BasicAdSetRow = {
  DATE: string | Date
  IMPRESSIONS: number
  INLINE_LINK_CLICKS: number
  REACH: number
  COST_PER_INLINE_LINK_CLICK: number
  CPC: number
  CPM: number
  CTR: number
  FREQUENCY: number
  SPEND: number
  ADSET_NAME: string
  CAMPAIGN_NAME: string
  INLINE_LINK_CLICK_CTR: number
  _FIVETRAN_SYNCED: string
  DATE_START?: string
}

type ApiResponse = {
  rows: BasicAdSetRow[]
  orderBy: string
  limit: number
}

const numberFormatter = new Intl.NumberFormat("en-US")
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const columnConfig: { key: keyof BasicAdSetRow; label: string }[] = [
  { key: "DATE", label: "Date" },
  { key: "IMPRESSIONS", label: "Impressions" },
  { key: "INLINE_LINK_CLICKS", label: "Inline Link Clicks" },
  { key: "REACH", label: "Reach" },
  { key: "COST_PER_INLINE_LINK_CLICK", label: "Cost / Inline Link Click" },
  { key: "CPC", label: "CPC" },
  { key: "CPM", label: "CPM" },
  { key: "CTR", label: "CTR" },
  { key: "FREQUENCY", label: "Frequency" },
  { key: "SPEND", label: "Spend" },
  { key: "ADSET_NAME", label: "Ad Set" },
  { key: "CAMPAIGN_NAME", label: "Campaign" },
  { key: "INLINE_LINK_CLICK_CTR", label: "Inline Link Click CTR" },
  { key: "_FIVETRAN_SYNCED", label: "Fivetran Synced" },
]

function getBaseUrl() {
  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  return base.replace(/\/$/, "")
}

async function fetchData(limit = 500): Promise<ApiResponse> {
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}/api/testing/meta-basic-ad-set?limit=${limit}`
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status}`)
  }

  return response.json()
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—"
  return numberFormatter.format(value)
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—"
  return currencyFormatter.format(value)
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—"
  const normalized = value > 1 ? value / 100 : value
  return percentFormatter.format(normalized)
}

function formatTableDate(value: string | Date | null | undefined) {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-AU")
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function renderCell(key: keyof BasicAdSetRow, row: BasicAdSetRow): string {
  const value = row[key]

  switch (key) {
    case "DATE":
      return formatTableDate(value as string | Date)
    case "SPEND":
    case "CPC":
    case "CPM":
    case "COST_PER_INLINE_LINK_CLICK":
      return formatCurrency(value as number)
    case "CTR":
    case "INLINE_LINK_CLICK_CTR":
      return formatPercent(value as number)
    case "_FIVETRAN_SYNCED":
    case "DATE_START":
      return formatDateTime(value as string)
    case "FREQUENCY":
      return typeof value === "number"
        ? numberFormatter.format(Number(value.toFixed(2)))
        : "—"
    default: {
      if (typeof value === "number") return formatNumber(value)
      if (value === null || value === undefined) return "—"
      return String(value)
    }
  }
}

function getLatestSyncTimestamp(rows: BasicAdSetRow[]) {
  if (!rows.length) return null
  const latest = rows.reduce<string | null>((acc, row) => {
    const current = row._FIVETRAN_SYNCED
    if (!current) return acc
    if (!acc) return current
    return new Date(current).getTime() > new Date(acc).getTime() ? current : acc
  }, null)
  return latest
}

export const dynamic = "force-dynamic"

export default async function MetaBasicAdSetTestingTable() {
  let data: ApiResponse | null = null
  let errorMessage: string | null = null

  try {
    data = await fetchData()
  } catch (error) {
    console.error("[testing-table] failed to load data", error)
    errorMessage = "Unable to load data from Snowflake."
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meta Basic Ad Set (Snowflake Test)</h1>
          <p className="text-sm text-muted-foreground">
            Displays BASIC_AD_SET rows from Snowflake. Sorted by most recent date.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Failed to load</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const rows = data?.rows ?? []
  const orderBy = data?.orderBy ?? "DATE"
  const limit = data?.limit ?? 0
  const latestSync = getLatestSyncTimestamp(rows)
  const csvRows = rows.map((row) => {
    const { DATE, ...rest } = row
    return { DATE, ...rest }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Meta Basic Ad Set (Snowflake Test)</h1>
          <p className="text-sm text-muted-foreground">
            Sorted by {orderBy} • Last synced {formatDateTime(latestSync)}
          </p>
        </div>
        <CSVExportButton data={csvRows} filename="meta-basic-ad-set" buttonText="Download CSV" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Ad Sets</CardTitle>
          <CardDescription>
            Showing {rows.length} row{rows.length === 1 ? "" : "s"} (limit {limit})
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              No rows returned.
            </div>
          ) : (
            <ScrollArea className="h-[70vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    {columnConfig.map((col) => (
                      <TableHead key={col.key}>{col.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={`${row.ADSET_NAME}-${idx}`}>
                      {columnConfig.map((col) => (
                        <TableCell key={col.key} className="whitespace-nowrap">
                          {renderCell(col.key, row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
