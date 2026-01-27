"use client"

import { useMemo, useState } from "react"
import { format, addMonths, startOfMonth } from "date-fns"
import { Search } from "lucide-react"

import { AdminGuard } from "@/components/guards/AdminGuard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SortableTableHeader, compareValues, type SortDirection } from "@/components/ui/sortable-table-header"

type AccrualRow = {
  clientName: string
  clientSlug?: string
  campaignName: string
  mbaNumber: string
  versionNumber: number
  lineItemKey: string
  lineItemName: string
  deliveryAmount: number
  billingAmount: number
  difference: number
}

type AccrualResponse = {
  months: string[]
  rows: AccrualRow[]
  meta?: Record<string, unknown>
}

type SortKey = "difference" | "client"

const currency = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })

function csvEscape(value: unknown): string {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

type DisplayRow =
  | (AccrualRow & { rowType: "line"; isGroupHeader: boolean })
  | {
      rowType: "subtotal"
      clientName: string
      mbaNumber: string
      campaignName: string
      versionNumber: number
      deliveryAmount: number
      billingAmount: number
      difference: number
    }

export default function AccrualPage() {
  const monthOptions = useMemo(() => {
    const currentDate = startOfMonth(new Date())
    return Array.from({ length: 25 }, (_, i) => {
      const date = addMonths(currentDate, i - 12)
      return {
        label: format(date, "MMMM yyyy"),
        value: format(date, "yyyy-MM"),
      }
    })
  }, [])

  const defaultMonth = useMemo(() => {
    const current = format(startOfMonth(new Date()), "yyyy-MM")
    return monthOptions.find((m) => m.value === current)?.value ?? monthOptions[12]?.value
  }, [monthOptions])

  const [selectedMonths, setSelectedMonths] = useState<string[]>(defaultMonth ? [defaultMonth] : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; details?: string } | null>(null)
  const [rows, setRows] = useState<AccrualRow[]>([])

  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("difference")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const selectedLabel = useMemo(() => {
    const labels = monthOptions
      .filter((o) => selectedMonths.includes(o.value))
      .map((o) => o.label)
    if (labels.length === 0) return "Select months"
    if (labels.length <= 2) return labels.join(", ")
    return `${labels.length} months selected`
  }, [monthOptions, selectedMonths])

  const toggleMonth = (value: string) => {
    setSelectedMonths((prev) => {
      const set = new Set(prev)
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return Array.from(set).sort()
    })
  }

  const toggleSort = (key: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey !== key) {
        setSortDirection(key === "difference" ? "desc" : "asc")
        return key
      }
      setSortDirection((currentDir) => {
        if (currentDir === null) return key === "difference" ? "desc" : "asc"
        if (currentDir === "asc") return "desc"
        return null
      })
      return currentKey
    })
  }

  const groupedDisplayRows = useMemo<DisplayRow[]>(() => {
    const needle = searchTerm.trim().toLowerCase()
    const groupKey = (r: AccrualRow) => `${r.mbaNumber}`

    const groups = new Map<string, AccrualRow[]>()
    for (const r of rows) {
      const key = groupKey(r)
      const list = groups.get(key)
      if (list) list.push(r)
      else groups.set(key, [r])
    }

    const groupMeta = Array.from(groups.entries()).map(([key, list]) => {
      const first = list[0]
      const clientName = first?.clientName ?? "Unknown"
      const campaignName = first?.campaignName ?? "Unknown campaign"
      const mbaNumber = first?.mbaNumber ?? "unknown"

      // Filtering rules:
      // - If search matches client, campaign, or MBA: show all rows in the MBA group
      // - Else: only show matching line items (and still show a subtotal for the MBA if any rows match)
      const clientMatch = needle ? clientName.toLowerCase().includes(needle) : true
      const campaignMatch = needle ? campaignName.toLowerCase().includes(needle) : true
      const mbaMatch = needle ? mbaNumber.toLowerCase().includes(needle) : true
      const includeAll = !needle || clientMatch || campaignMatch || mbaMatch

      const visible = includeAll
        ? list
        : list.filter((r) => (r.lineItemName || "").toLowerCase().includes(needle))

      const subtotal = list.reduce(
        (acc, r) => {
          acc.delivery += r.deliveryAmount || 0
          acc.billing += r.billingAmount || 0
          return acc
        },
        { delivery: 0, billing: 0 }
      )

      const subtotalRow: DisplayRow = {
        rowType: "subtotal",
        clientName,
        mbaNumber,
        campaignName,
        versionNumber: 0,
        deliveryAmount: subtotal.delivery,
        billingAmount: subtotal.billing,
        difference: subtotal.delivery - subtotal.billing,
      }

      return { key, clientName, campaignName, mbaNumber, list, visible, subtotalRow }
    })

    // Drop empty groups when searching and nothing matches inside.
    const nonEmpty = groupMeta.filter((g) => (needle ? g.visible.length > 0 : g.list.length > 0))

    // Sort groups by requested key/direction using the subtotal difference (for difference sort).
    const direction = sortDirection ?? (sortKey === "difference" ? "desc" : "asc")
    const sortedGroups = [...nonEmpty].sort((a, b) => {
      if (sortKey === "client") {
        // Stable secondary sort by MBA for readability
        const byClient = compareValues(a.clientName, b.clientName, direction)
        if (byClient !== 0) return byClient
        return compareValues(a.mbaNumber, b.mbaNumber, "asc")
      }
      return compareValues(a.subtotalRow.difference, b.subtotalRow.difference, direction)
    })

    // Within each MBA group, sort by version desc, then difference desc.
    const out: DisplayRow[] = []
    for (const g of sortedGroups) {
      const lines = [...(needle ? g.visible : g.list)].sort((a, b) => {
        const byVersion = compareValues(a.versionNumber, b.versionNumber, "desc")
        if (byVersion !== 0) return byVersion
        return compareValues(a.difference, b.difference, "desc")
      })
      out.push(
        ...lines.map((r, idx) => ({
          ...r,
          rowType: "line" as const,
          isGroupHeader: idx === 0,
        }))
      )
      out.push(g.subtotalRow)
    }
    return out
  }, [rows, searchTerm, sortDirection, sortKey])

  const loadAccruals = async () => {
    setError(null)
    setLoading(true)
    try {
      const monthsParam = selectedMonths.join(",")
      const res = await fetch(`/api/finance/accrual?months=${encodeURIComponent(monthsParam)}`, {
        cache: "no-store",
      })

      let payload: AccrualResponse | null = null
      try {
        payload = (await res.json()) as AccrualResponse
      } catch {
        payload = null
      }

      if (!res.ok) {
        const detail = payload?.meta ? JSON.stringify(payload.meta, null, 2) : undefined
        throw new Error(`Request failed (${res.status}).${detail ? ` Details: ${detail}` : ""}`)
      }

      setRows(Array.isArray(payload?.rows) ? payload!.rows : [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({
        message: "Failed to load accruals.",
        details: msg,
      })
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const downloadCsv = () => {
    const data = groupedDisplayRows
    const header = [
      "Row Type",
      "Client",
      "Campaign",
      "MBA Number",
      "Version",
      "Line item",
      "Delivery",
      "Billing",
      "Difference",
    ]

    const lines = [
      header.join(","),
      ...data.map((r) =>
        [
          csvEscape(r.rowType),
          csvEscape(r.clientName),
          csvEscape(r.campaignName),
          csvEscape(r.mbaNumber),
          csvEscape(r.rowType === "subtotal" ? "" : r.versionNumber),
          csvEscape(r.rowType === "subtotal" ? "Subtotal (MBA)" : r.lineItemName),
          csvEscape(r.deliveryAmount || 0),
          csvEscape(r.billingAmount || 0),
          csvEscape(r.difference || 0),
        ].join(",")
      ),
    ]

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `accrual-${selectedMonths.join("_") || "months"}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminGuard>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Accrual</h1>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">{selectedLabel}</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64" align="start">
                    <DropdownMenuLabel>Select months</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {monthOptions.map((opt) => (
                      <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={selectedMonths.includes(opt.value)}
                        onCheckedChange={() => toggleMonth(opt.value)}
                      >
                        {opt.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button onClick={loadAccruals} disabled={loading || selectedMonths.length === 0}>
                  Load accruals
                </Button>

                <Button
                  variant="outline"
                  onClick={downloadCsv}
                  disabled={loading || groupedDisplayRows.length === 0}
                >
                  Download CSV
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search client, campaign, or MBA…"
                  className="w-72 pl-10"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>{error.message}</AlertTitle>
                {error.details ? <AlertDescription className="whitespace-pre-wrap">{error.details}</AlertDescription> : null}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Accrual rows</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>MBA</TableHead>
                      <TableHead align="right">Version</TableHead>
                      <TableHead>Line item</TableHead>
                      <TableHead align="right">Delivery</TableHead>
                      <TableHead align="right">Billing</TableHead>
                      <TableHead align="right">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell align="right"><Skeleton className="ml-auto h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                        <TableCell align="right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                        <TableCell align="right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                        <TableCell align="right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHeader
                      label="Client"
                      direction={sortKey === "client" ? sortDirection : null}
                      onToggle={() => toggleSort("client")}
                    />
                    <TableHead>Campaign</TableHead>
                    <TableHead>MBA</TableHead>
                    <TableHead align="right">Version</TableHead>
                    <TableHead>Line item</TableHead>
                    <TableHead align="right">Delivery</TableHead>
                    <TableHead align="right">Billing</TableHead>
                    <SortableTableHeader
                      label="Difference"
                      direction={sortKey === "difference" ? sortDirection : null}
                      onToggle={() => toggleSort("difference")}
                      align="right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedDisplayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No rows yet. Select month(s) and click “Load accruals”.
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupedDisplayRows.map((r) => (
                      <TableRow
                        key={
                          r.rowType === "subtotal"
                            ? `${r.mbaNumber}__subtotal`
                            : `${r.mbaNumber}__${r.versionNumber}__${r.lineItemKey}`
                        }
                        className={r.rowType === "subtotal" ? "bg-muted/30 font-semibold" : undefined}
                      >
                        <TableCell className="font-medium">
                          {r.rowType === "subtotal" || (r.rowType === "line" && r.isGroupHeader) ? r.clientName : ""}
                        </TableCell>
                        <TableCell>
                          {r.rowType === "subtotal" || (r.rowType === "line" && r.isGroupHeader) ? r.campaignName : ""}
                        </TableCell>
                        <TableCell>
                          {r.rowType === "subtotal" || (r.rowType === "line" && r.isGroupHeader) ? r.mbaNumber : ""}
                        </TableCell>
                        <TableCell align="right">{r.rowType === "subtotal" ? "" : r.versionNumber}</TableCell>
                        <TableCell>{r.rowType === "subtotal" ? "Subtotal (MBA)" : r.lineItemName}</TableCell>
                        <TableCell align="right">{currency.format(r.deliveryAmount || 0)}</TableCell>
                        <TableCell align="right">{currency.format(r.billingAmount || 0)}</TableCell>
                        <TableCell
                          align="right"
                          className={
                            r.difference < 0
                              ? "text-red-600"
                              : r.difference > 0
                                ? "text-emerald-700"
                                : ""
                          }
                        >
                          {currency.format(r.difference || 0)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}

