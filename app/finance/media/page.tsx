"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Download } from "lucide-react"
import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { format, addMonths, startOfMonth } from "date-fns"

interface FinanceLineItem {
  itemCode: string
  mediaType: string
  description: string
  amount: number
}

interface FinanceServiceRow {
  itemCode: string
  service: string
  amount: number
}

interface FinanceCampaignData {
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

export default function FinanceMediaPage() {
  const currentDate = startOfMonth(new Date())

  // Generate month/year options: 12 months back and 12 months forward
  const monthYearOptions = Array.from({ length: 25 }, (_, i) => {
    const date = addMonths(currentDate, i - 12) // -12 to +12 months
    const monthYear = format(date, "MMMM yyyy")
    const value = format(date, "yyyy-MM")
    return {
      label: monthYear,
      value: value,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    }
  })

  const [selectedMonthYear, setSelectedMonthYear] = useState(
    monthYearOptions.find((opt) => opt.year === currentDate.getFullYear() && opt.month === currentDate.getMonth() + 1)?.value || monthYearOptions[12].value
  )
  const [loading, setLoading] = useState(false)
  const [bookedApproved, setBookedApproved] = useState<FinanceCampaignData[]>([])
  const [other, setOther] = useState<FinanceCampaignData[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/finance/data?month=${selectedMonthYear}`)
      if (!response.ok) {
        throw new Error("Failed to fetch finance data")
      }
      const data = await response.json()
      setBookedApproved(data.bookedApproved || [])
      setOther(data.other || [])
    } catch (error) {
      console.error("Error loading finance data:", error)
      alert("Failed to load finance data. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = async (campaigns: FinanceCampaignData[], sectionName: string) => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Finance Report")

    // Set column widths
    worksheet.columns = [
      { width: 20 }, // Column A - Item Code
      { width: 25 }, // Column B - Media Type / Service
      { width: 40 }, // Column C - Description
      { width: 15 }, // Column D - Amount
    ]

    // Header style
    const headerStyle = {
      font: { bold: true, size: 12 },
      fill: {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FFE0E0E0" },
      },
      border: {
        top: { style: "thin" as const },
        bottom: { style: "thin" as const },
        left: { style: "thin" as const },
        right: { style: "thin" as const },
      },
    }

    let rowIndex = 1

    campaigns.forEach((campaign) => {
      // Campaign header
      worksheet.mergeCells(rowIndex, 1, rowIndex, 4)
      const headerCell = worksheet.getCell(rowIndex, 1)
      headerCell.value = `${campaign.clientName} - ${campaign.campaignName} (${campaign.mbaNumber})`
      headerCell.font = { bold: true, size: 14 }
      headerCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD0D0D0" },
      }
      rowIndex++

      // Campaign details
      const details = [
        ["Client Name", campaign.clientName],
        ["MBA Number", campaign.mbaNumber],
        ["PO Number", campaign.poNumber || "N/A"],
        ["Campaign Name", campaign.campaignName],
        ["Payment Days & Payment Terms", `${campaign.paymentDays} - ${campaign.paymentTerms}`],
        ["Invoice Date", format(new Date(campaign.invoiceDate), "dd/MM/yyyy")],
      ]

      details.forEach(([label, value]) => {
        worksheet.getCell(rowIndex, 1).value = label
        worksheet.getCell(rowIndex, 1).font = { bold: true }
        worksheet.getCell(rowIndex, 2).value = value
        rowIndex++
      })

      rowIndex++ // Empty row

      // Table headers
      worksheet.getCell(rowIndex, 1).value = "Item Code"
      worksheet.getCell(rowIndex, 1).style = headerStyle
      worksheet.getCell(rowIndex, 2).value = "Media Type"
      worksheet.getCell(rowIndex, 2).style = headerStyle
      worksheet.getCell(rowIndex, 3).value = "Description"
      worksheet.getCell(rowIndex, 3).style = headerStyle
      worksheet.getCell(rowIndex, 4).value = "Amount"
      worksheet.getCell(rowIndex, 4).style = headerStyle
      rowIndex++

      // Line items
      campaign.lineItems.forEach((item) => {
        worksheet.getCell(rowIndex, 1).value = item.itemCode
        worksheet.getCell(rowIndex, 2).value = item.mediaType
        worksheet.getCell(rowIndex, 3).value = item.description
        worksheet.getCell(rowIndex, 4).value = item.amount
        worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
        rowIndex++
      })

      // Service rows
      campaign.serviceRows.forEach((service) => {
        worksheet.getCell(rowIndex, 1).value = service.itemCode
        worksheet.getCell(rowIndex, 2).value = service.service
        worksheet.getCell(rowIndex, 4).value = service.amount
        worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
        rowIndex++
      })

      // Total row
      worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
      worksheet.getCell(rowIndex, 1).value = "Total"
      worksheet.getCell(rowIndex, 1).font = { bold: true }
      worksheet.getCell(rowIndex, 4).value = campaign.total
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      worksheet.getCell(rowIndex, 4).font = { bold: true }
      rowIndex++

      rowIndex += 2 // Empty rows between campaigns
    })

    // Generate file and download
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const selectedOption = monthYearOptions.find((opt) => opt.value === selectedMonthYear)
    const monthYearLabel = selectedOption?.label.replace(" ", "_") || "Month_Year"
    saveAs(blob, `Finance_${sectionName}_${monthYearLabel}.xlsx`)
  }

  const renderCampaignTable = (campaign: FinanceCampaignData) => {
    // Total already includes line items and services from the API
    const totalAmount = campaign.total

    return (
      <div key={campaign.mbaNumber} className="mb-8">
        {/* Campaign Header */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-semibold">Client Name: </span>
              <span>{campaign.clientName}</span>
            </div>
            <div>
              <span className="font-semibold">MBA Number: </span>
              <span>{campaign.mbaNumber}</span>
            </div>
            <div>
              <span className="font-semibold">PO Number: </span>
              <span>{campaign.poNumber || "N/A"}</span>
            </div>
            <div>
              <span className="font-semibold">Campaign Name: </span>
              <span>{campaign.campaignName}</span>
            </div>
            <div>
              <span className="font-semibold">Payment Days & Payment Terms: </span>
              <span>
                {campaign.paymentDays} - {campaign.paymentTerms}
              </span>
            </div>
            <div>
              <span className="font-semibold">Invoice Date: </span>
              <span>{format(new Date(campaign.invoiceDate), "dd/MM/yyyy")}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Code</TableHead>
              <TableHead>Media Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaign.lineItems.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.itemCode}</TableCell>
                <TableCell>{item.mediaType}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right">
                  ${item.amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
            {/* Service Rows */}
            {campaign.serviceRows.map((service, index) => (
              <TableRow key={`service-${index}`}>
                <TableCell>{service.itemCode}</TableCell>
                <TableCell>{service.service}</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">
                  ${service.amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
            {/* Total Row */}
            <TableRow className="font-bold bg-gray-100">
              <TableCell colSpan={3} className="text-right">
                Total
              </TableCell>
              <TableCell className="text-right">
                ${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Finance - Media</h1>
        <div className="flex gap-4 items-center">
          <Select
            value={selectedMonthYear}
            onValueChange={(value) => setSelectedMonthYear(value)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select month/year" />
            </SelectTrigger>
            <SelectContent>
              {monthYearOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={loadData} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load"
            )}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {!loading && (bookedApproved.length > 0 || other.length > 0) && (
        <>
          {/* Section 1: Booked/Approved Campaigns */}
          {bookedApproved.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Booked/Approved Campaigns</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToExcel(bookedApproved, "BookedApproved")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export to Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bookedApproved.map((campaign) => renderCampaignTable(campaign))}
              </CardContent>
            </Card>
          )}

          {/* Section 2: Other Campaigns */}
          {other.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Other Campaigns</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToExcel(other, "Other")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export to Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {other.map((campaign) => renderCampaignTable(campaign))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && bookedApproved.length === 0 && other.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No data available for the selected month. Click "Load" to fetch data.
          </CardContent>
        </Card>
      )}
    </div>
  )
}














