"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import { ArrowLeft, Download, FileText, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { formatAUD } from "@/lib/format/money"
import { parseScopeJSON } from "@/lib/finance/scopeScheduleExtract"
import { scopeScheduleGapLabel, sumScopeCostItems } from "@/lib/scopes/scopeListHelpers"
import { resolveKnownScopeStatus } from "@/lib/scopes/groupScopesByStatus"
import { toast } from "@/components/ui/use-toast"

type ScopeRecord = {
  id: number
  client_name?: string
  contact_name?: string
  contact_email?: string
  scope_date?: string
  scope_version?: number
  scope_id?: string
  project_name?: string
  project_status?: string
  project_overview?: string
  deliverables?: string
  tasks_steps?: string
  timelines?: string
  responsibilities?: string
  requirements?: string
  assumptions?: string
  exclusions?: string
  cost?: unknown
  billing_schedule?: unknown
  payment_terms_and_conditions?: string
}

function asCostRows(cost: unknown): Array<{ expense_category?: string; description?: string; cost?: number }> {
  const parsed = parseScopeJSON(cost)
  return Array.isArray(parsed) ? parsed : []
}

function asBillingRows(schedule: unknown): Array<{ month?: string; cost?: number }> {
  const parsed = parseScopeJSON(schedule)
  return Array.isArray(parsed) ? parsed : []
}

export default function ScopeOfWorkViewPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? "")
  const [scope, setScope] = useState<ScopeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/scopes-of-work/${id}`)
        if (!res.ok) throw new Error("Failed to load scope")
        const data = (await res.json()) as ScopeRecord
        if (!cancelled) setScope(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load scope")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  async function downloadPdf() {
    if (!scope) return
    setPdfLoading(true)
    try {
      const response = await fetch("/api/scopes-of-work/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scope.id }),
      })
      if (!response.ok) throw new Error("Failed to generate PDF")
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Scope_${scope.client_name || "client"}_${scope.project_name || scope.id}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e) {
      toast({
        title: "PDF failed",
        description: e instanceof Error ? e.message : "Could not generate PDF",
        variant: "destructive",
      })
    } finally {
      setPdfLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full px-4 py-6 md:px-6">
        <LoadingState rows={8} />
      </div>
    )
  }

  if (error || !scope) {
    return (
      <div className="w-full px-4 py-6 md:px-6">
        <ErrorState title="Unable to load scope" message={error || "Not found"} />
        <Button className="mt-4" variant="outline" onClick={() => router.push("/scopes-of-work")}>
          Back to list
        </Button>
      </div>
    )
  }

  const costRows = asCostRows(scope.cost)
  const billingRows = asBillingRows(scope.billing_schedule)
  const total = sumScopeCostItems(scope.cost)
  const gapLabel = scopeScheduleGapLabel(scope)
  const knownStatus = resolveKnownScopeStatus(scope.project_status)
  const statusLabel = knownStatus ?? scope.project_status ?? "—"

  return (
    <div className="w-full min-h-screen">
      <div className="w-full space-y-6 px-4 py-6 md:px-6">
        <MediaPlanEditorHero
          title={scope.project_name || "Scope of Work"}
          Icon={FileText}
          detail={
            <p>
              Read-only view · {scope.client_name || "—"} · {scope.scope_id || `ID ${scope.id}`}
            </p>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => router.push("/scopes-of-work")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                List
              </Button>
              <Button variant="outline" disabled={pdfLoading} onClick={() => void downloadPdf()}>
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button onClick={() => router.push(`/scopes-of-work/${scope.id}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-card border border-border shadow-e1">
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{scope.client_name || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Scope ID</span>
                <span className="num font-mono text-xs">{scope.scope_id || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline">{statusLabel}</Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Version</span>
                <span className="num">{scope.scope_version ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Date</span>
                <span className="num">
                  {scope.scope_date
                    ? format(new Date(scope.scope_date), "dd/MM/yyyy")
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Value</span>
                <span className="num font-medium">{total > 0 ? formatAUD(total) : "—"}</span>
              </div>
              {gapLabel ? (
                <p className="text-status-behind-fg pt-2">{gapLabel}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-card border border-border shadow-e1">
            <CardHeader>
              <CardTitle className="text-base">Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Contact</span>
                <span>{scope.contact_name || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Email</span>
                <span>{scope.contact_email || "—"}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-card border border-border shadow-e1">
          <CardHeader>
            <CardTitle className="text-base">Project overview</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {scope.project_overview || "—"}
          </CardContent>
        </Card>

        <Card className="rounded-card border border-border shadow-e1">
          <CardHeader>
            <CardTitle className="text-base">Cost breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No cost rows
                    </TableCell>
                  </TableRow>
                ) : (
                  costRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.expense_category || "—"}</TableCell>
                      <TableCell>{row.description || "—"}</TableCell>
                      <TableCell className="num text-right">
                        {formatAUD(Number(row.cost) || 0)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-right font-semibold">
                    Total (ex GST)
                  </TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatAUD(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-card border border-border shadow-e1">
          <CardHeader>
            <CardTitle className="text-base">Billing schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billingRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      No months scheduled
                    </TableCell>
                  </TableRow>
                ) : (
                  billingRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.month || "—"}</TableCell>
                      <TableCell className="num text-right">
                        {formatAUD(Number(row.cost) || 0)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {gapLabel ? (
              <p className="mt-3 text-sm text-status-behind-fg">{gapLabel}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
