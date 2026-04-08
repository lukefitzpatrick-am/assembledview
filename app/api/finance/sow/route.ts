import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { formatInvoiceDate, financeClientNamesMatch, type FinanceLineItem } from "@/lib/finance/utils"
import {
  extractLineItemsFromScopeCost,
  extractLineItemsFromScopeSchedule,
  parseScopeJSON,
} from "@/lib/finance/scopeScheduleExtract"
import { xanoUrl } from "@/lib/api/xano"

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const monthParam = searchParams.get("month") // YYYY-MM
    const clientFilterRaw = searchParams.get("client")
    const clientFilter = clientFilterRaw ? decodeURIComponent(clientFilterRaw.trim()) : ""

    if (!monthParam) {
      return NextResponse.json({ error: "Month parameter is required (format: YYYY-MM)" }, { status: 400 })
    }

    const [year, month] = monthParam.split("-").map(Number)
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 })
    }

    const scopesResponse = await axios.get(xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL"))
    const scopes: ScopeOfWork[] = Array.isArray(scopesResponse.data) ? scopesResponse.data : []

    const bookedApproved: FinanceCampaignData[] = []
    const other: FinanceCampaignData[] = []

    scopes.forEach((scope) => {
      const scopeClientName = scope.client_name || ""
      if (clientFilter && !financeClientNamesMatch(scopeClientName, clientFilter)) {
        return
      }

      const billingSchedule = parseScopeJSON(scope.billingSchedule ?? scope.billing_schedule)
      const lineItemsFromSchedule = extractLineItemsFromScopeSchedule(billingSchedule, year, month)
      const fallbackLineItems = extractLineItemsFromScopeCost(scope.cost)
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
        clientFilter: clientFilter || undefined,
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


























