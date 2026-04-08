/**
 * Legacy publisher-grouped view over **Xano `finance_billing_records`** (media/sow/retainer line items).
 * The finance hub **Payables** tab is the successor for **delivery-schedule** amounts (`media_plan_versions.deliverySchedule`);
 * see `GET /api/finance/payables` and `aggregatePayablesToPublisherGroups`.
 */
import axios from "axios"
import { NextRequest, NextResponse } from "next/server"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

type BillingStatus = "draft" | "booked" | "approved" | "invoiced" | "paid" | "cancelled"
type BillingType = "media" | "sow" | "retainer"

type BillingLineItem = {
  finance_billing_records_id: number
  publisher_name: string | null
  client_pays_media: boolean
  amount: number
}

type BillingRecord = {
  id: number
  billing_type: BillingType
  client_name: string
  mba_number: string | null
  campaign_name: string | null
  status: BillingStatus
  billing_month: string
  line_items: BillingLineItem[]
}

function enumerateMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  if (!fy || !fm || !ty || !tm) return [from]
  const start = new Date(fy, fm - 1, 1)
  const end = new Date(ty, tm - 1, 1)
  if (start > end) return [from]
  const out: string[] = []
  let ptr = start
  while (ptr <= end) {
    const y = ptr.getFullYear()
    const m = String(ptr.getMonth() + 1).padStart(2, "0")
    out.push(`${y}-${m}`)
    ptr.setMonth(ptr.getMonth() + 1)
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams
    const monthFrom = search.get("month_from")
    const monthTo = search.get("month_to") || monthFrom
    const rangeMode = search.get("range_mode") || "single"
    const billingType = search.get("billing_type")
    const status = search.get("status")
    const clients = (search.get("clients") || "")
      .split(",")
      .map((c) => decodeURIComponent(c.trim()))
      .filter(Boolean)

    if (!monthFrom) {
      return NextResponse.json(
        { error: "month_from is required (format: YYYY-MM)" },
        { status: 400 }
      )
    }

    const targetMonths = rangeMode === "range" ? enumerateMonths(monthFrom, monthTo || monthFrom) : [monthFrom]
    const monthSet = new Set(targetMonths)

    const xanoRes = await axios.get(xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL"))
    const rawRecords = parseXanoListPayload(xanoRes.data) as BillingRecord[]

    const filteredRecords = rawRecords.filter((record) => {
      if (!monthSet.has(record.billing_month)) return false
      if (billingType && record.billing_type !== billingType) return false
      if (status && record.status !== status) return false
      if (clients.length > 0 && !clients.includes(record.client_name)) return false
      return true
    })

    const publisherMap = new Map<
      string,
      {
        publisherName: string
        subtotal: number
        clientsMap: Map<
          string,
          {
            clientName: string
            campaignsMap: Map<
              string,
              {
                billingRecordId: number
                clientName: string
                mbaNumber: string
                campaignName: string
                totalMedia: number
                status: BillingStatus
                billingType: BillingType
              }
            >
          }
        >
      }
    >()

    for (const record of filteredRecords) {
      for (const item of record.line_items || []) {
        if (item.client_pays_media) continue
        const amount = Number(item.amount || 0)
        if (!amount) continue

        const publisherName = item.publisher_name || "Unspecified publisher"
        const publisher = publisherMap.get(publisherName) || {
          publisherName,
          subtotal: 0,
          clientsMap: new Map(),
        }

        const clientName = record.client_name || "Unknown client"
        const client = publisher.clientsMap.get(clientName) || {
          clientName,
          campaignsMap: new Map(),
        }

        const campaignKey = String(record.id)
        const campaign = client.campaignsMap.get(campaignKey) || {
          billingRecordId: record.id,
          clientName,
          mbaNumber: record.mba_number || "",
          campaignName: record.campaign_name || "Untitled campaign",
          totalMedia: 0,
          status: record.status,
          billingType: record.billing_type,
        }

        campaign.totalMedia += amount
        client.campaignsMap.set(campaignKey, campaign)
        publisher.subtotal += amount
        publisher.clientsMap.set(clientName, client)
        publisherMap.set(publisherName, publisher)
      }
    }

    const publishers = Array.from(publisherMap.values())
      .map((pub) => ({
        publisherName: pub.publisherName,
        subtotal: pub.subtotal,
        clients: Array.from(pub.clientsMap.values())
          .map((client) => ({
            clientName: client.clientName,
            campaigns: Array.from(client.campaignsMap.values()).sort((a, b) =>
              a.campaignName.localeCompare(b.campaignName)
            ),
          }))
          .sort((a, b) => a.clientName.localeCompare(b.clientName)),
      }))
      .sort((a, b) => a.publisherName.localeCompare(b.publisherName))

    const grandTotal = publishers.reduce((sum, pub) => sum + pub.subtotal, 0)

    return NextResponse.json({
      publishers,
      grandTotal,
      records: filteredRecords,
      meta: {
        months: targetMonths,
        count: filteredRecords.length,
      },
    })
  } catch (error: any) {
    console.error("Error fetching publisher finance data:", error)
    return NextResponse.json(
      { error: "Failed to fetch publisher finance data", details: error.message },
      { status: 500 }
    )
  }
}
