import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { formatInvoiceDate, matchMonthYear, parseBillingScheduleAmount } from "@/lib/finance/utils"

const XANO_SCOPES_BASE_URL = process.env.XANO_SCOPES_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:idlsZiVX"

type ScopeOfWork = {
  id: number
  scope_id?: string
  client_name?: string
  project_name?: string
  project_status?: string
  scope_date?: string
  payment_terms_and_conditions?: string
  billing_schedule?: any
  billingSchedule?: any
  cost?: any
}

type FinanceLineItem = {
  itemCode: string
  mediaType: string
  description: string
  amount: number
}

type FinanceServiceRow = {
  itemCode: string
  service: string
  amount: number
}

type FinanceCampaignData = {
  clientName: string
  mbaNumber: string
  poNumber?: string
  campaignName: string
  paymentDays: number
  paymentTerms: string
  invoiceDate: string
  lineItems: FinanceLineItem[]
  serviceRows: FinanceServiceRow[]
  total: number
}

const parseJSON = (val: any) => {
  if (!val) return null
  if (typeof val !== "string") return val
  try {
    return JSON.parse(val)
  } catch {
    return null
  }
}

const findMonthEntry = (schedule: any[], year: number, month: number) => {
  return schedule.find((entry: any) => {
    const label = entry?.monthYear || entry?.month_year || entry?.month || entry?.month_label
    return matchMonthYear(label ?? "", year, month)
  })
}

const extractLineItemsFromSchedule = (billingSchedule: any, year: number, month: number): FinanceLineItem[] => {
  if (!billingSchedule) return []

  let scheduleArray: any[] = []
  if (Array.isArray(billingSchedule)) {
    scheduleArray = billingSchedule
  } else if (billingSchedule.months && Array.isArray(billingSchedule.months)) {
    scheduleArray = billingSchedule.months
  } else {
    return []
  }

  const monthEntry = findMonthEntry(scheduleArray, year, month)
  if (!monthEntry) return []

  const lineItems: FinanceLineItem[] = []

  // If month entry has direct lineItems array
  if (Array.isArray((monthEntry as any).lineItems)) {
    (monthEntry as any).lineItems.forEach((item: any, idx: number) => {
      const amount = parseBillingScheduleAmount(item.amount)
      if (amount > 0) {
        lineItems.push({
          itemCode: item.itemCode || "SOW",
          mediaType: item.mediaType || "Scope of Work",
          description: item.description || item.name || `Line Item ${idx + 1}`,
          amount,
        })
      }
    })
  }

  // Fallback: mediaTypes shape similar to media plan schedules
  if (Array.isArray((monthEntry as any).mediaTypes)) {
    (monthEntry as any).mediaTypes.forEach((mediaType: any) => {
      if (Array.isArray(mediaType.lineItems)) {
        mediaType.lineItems.forEach((item: any, idx: number) => {
          const amount = parseBillingScheduleAmount(item.amount)
          if (amount > 0) {
            lineItems.push({
              itemCode: item.itemCode || "SOW",
              mediaType: mediaType.mediaType || mediaType.name || "Scope of Work",
              description: item.description || item.header1 || item.header2 || `Line Item ${idx + 1}`,
              amount,
            })
          }
        })
      }
    })
  }

  return lineItems
}

const extractLineItemsFromCost = (cost: any): FinanceLineItem[] => {
  if (!cost) return []
  const itemsArray = Array.isArray(cost) ? cost : [cost]
  return itemsArray
    .map((item: any, idx: number) => {
      const amount = parseBillingScheduleAmount(item.amount ?? item.cost ?? item.value)
      return {
        itemCode: "SOW",
        mediaType: "Scope of Work",
        description: item.description || item.name || `Line Item ${idx + 1}`,
        amount,
      }
    })
    .filter((item) => item.amount > 0)
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const monthParam = searchParams.get("month") // YYYY-MM

    if (!monthParam) {
      return NextResponse.json({ error: "Month parameter is required (format: YYYY-MM)" }, { status: 400 })
    }

    const [year, month] = monthParam.split("-").map(Number)
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 })
    }

    const scopesResponse = await axios.get(`${XANO_SCOPES_BASE_URL}/scope_of_work`)
    const scopes: ScopeOfWork[] = Array.isArray(scopesResponse.data) ? scopesResponse.data : []

    const bookedApproved: FinanceCampaignData[] = []
    const other: FinanceCampaignData[] = []

    scopes.forEach((scope) => {
      const billingSchedule = parseJSON(scope.billingSchedule ?? scope.billing_schedule)
      const lineItemsFromSchedule = extractLineItemsFromSchedule(billingSchedule, year, month)
      const fallbackLineItems = extractLineItemsFromCost(scope.cost)
      const lineItems = lineItemsFromSchedule.length > 0 ? lineItemsFromSchedule : fallbackLineItems

      const total = lineItems.reduce((sum, item) => sum + item.amount, 0)
      if (total <= 0) return

      const paymentTerms = scope.payment_terms_and_conditions || "Net 30 days"
      const paymentDays = 30
      const campaignData: FinanceCampaignData = {
        clientName: scope.client_name || "Unknown Client",
        mbaNumber: scope.scope_id || scope.id?.toString() || "SOW",
        poNumber: "",
        campaignName: scope.project_name || "Scope of Work",
        paymentDays,
        paymentTerms,
        invoiceDate: formatInvoiceDate(year, month),
        lineItems,
        serviceRows: [],
        total,
      }

      const status = (scope.project_status || "").toLowerCase()
      if (status === "approved" || status === "in-progress" || status === "in progress") {
        bookedApproved.push(campaignData)
      } else {
        other.push(campaignData)
      }
    })

    return NextResponse.json({
      bookedApproved,
      other,
      meta: {
        selectedMonth: monthParam,
        totalScopes: scopes.length,
        bookedApprovedCount: bookedApproved.length,
        otherCount: other.length,
      },
    })
  } catch (error: any) {
    console.error("Error fetching finance SOW data:", error)
    return NextResponse.json({ error: "Failed to fetch finance SOW data", details: error.message }, { status: 500 })
  }
}


























