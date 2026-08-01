"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { format } from "date-fns"
import { Download, Eye, FileText, Pencil, PlusCircle, Search } from "lucide-react"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { formatAUD } from "@/lib/format/money"
import {
  groupScopesByStatus,
  KNOWN_SCOPE_STATUSES,
  OTHER_SCOPE_STATUS_GROUP,
  resolveKnownScopeStatus,
} from "@/lib/scopes/groupScopesByStatus"
import {
  getScheduledCostPercentage,
  progressToneForScheduledPct,
  scopeMatchesVisibleSearch,
  scopeScheduleGapLabel,
  sumScopeCostItems,
} from "@/lib/scopes/scopeListHelpers"
import { toast } from "@/components/ui/use-toast"

interface ScopeOfWork {
  id: number
  created_at: number
  client_name: string
  contact_name: string
  contact_email: string
  scope_date: string
  scope_version: number
  scope_id?: string
  project_name: string
  project_status: string
  project_overview: string
  deliverables: string
  tasks_steps: string
  timelines: string
  responsibilities: string
  requirements: string
  assumptions: string
  exclusions: string
  cost: unknown
  billing_schedule?: unknown
  payment_terms_and_conditions: string
}

type StatusTone = {
  badge: "secondary" | "info" | "success" | "warning" | "danger"
  accent: string
}

const STATUS_TONES: Record<string, StatusTone> = {
  Draft: { badge: "secondary", accent: "bg-muted" },
  Submitted: { badge: "info", accent: "bg-pacing-on-track" },
  Approved: { badge: "success", accent: "bg-pacing-ahead" },
  "In-Progress": { badge: "warning", accent: "bg-pacing-behind" },
  Completed: { badge: "success", accent: "bg-pacing-ahead" },
  Cancelled: { badge: "danger", accent: "bg-pacing-critical" },
  [OTHER_SCOPE_STATUS_GROUP]: { badge: "secondary", accent: "bg-muted" },
}

function getStatusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? STATUS_TONES[OTHER_SCOPE_STATUS_GROUP]
}

export default function ScopesOfWorkPage() {
  const router = useRouter()
  const [scopes, setScopes] = useState<ScopeOfWork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null)

  useEffect(() => {
    const fetchScopes = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/scopes-of-work")
        if (!response.ok) {
          throw new Error("Failed to fetch scopes of work")
        }
        const data = await response.json()
        const scopesData = Array.isArray(data) ? data : [data]
        setScopes(scopesData as ScopeOfWork[])
      } catch (err) {
        console.error("Error fetching scopes of work:", err)
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    void fetchScopes()
  }, [])

  const filteredScopes = useMemo(
    () => scopes.filter((scope) => scopeMatchesVisibleSearch(scope, searchTerm)),
    [scopes, searchTerm],
  )

  const statusGroups = useMemo(() => groupScopesByStatus(filteredScopes), [filteredScopes])

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy")
    } catch {
      return dateString
    }
  }

  async function downloadPdf(scope: ScopeOfWork) {
    setPdfLoadingId(scope.id)
    try {
      const response = await fetch("/api/scopes-of-work/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scope.id }),
      })
      if (!response.ok) {
        throw new Error("Failed to generate PDF")
      }
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
      console.error(e)
      toast({
        title: "PDF failed",
        description: e instanceof Error ? e.message : "Could not generate PDF",
        variant: "destructive",
      })
    } finally {
      setPdfLoadingId(null)
    }
  }

  return (
    <div className="w-full min-h-screen">
      <div className="w-full space-y-6 px-4 py-6 md:px-6">
        <MediaPlanEditorHero
          className="mb-2"
          title="Scopes of Work"
          Icon={FileText}
          detail={<p>Create, search, and open scopes of work across all project statuses.</p>}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search client, scope ID, value…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-72 pl-10"
                />
              </div>
              <Button onClick={() => router.push("/scopes-of-work/create")}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create scope
              </Button>
            </div>
          }
        />

        <div className="space-y-4">
          {error ? (
            <ErrorState title="Unable to load scopes" message={error} />
          ) : null}

          {loading ? (
            <div className="space-y-6">
              {KNOWN_SCOPE_STATUSES.map((status) => (
                <Card
                  key={status}
                  className="w-full overflow-hidden rounded-card border border-border bg-card shadow-e1"
                >
                  <div className="h-[3px] bg-muted" />
                  <CardHeader className="px-5 pb-3 pt-4">
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{status}</span>
                      <Badge variant="secondary" size="sm">
                        Loading
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <LoadingState rows={4} className="border-0 bg-transparent p-0 shadow-none" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {statusGroups.map((group) => {
                const tone = getStatusTone(group.status)
                const showEmptyKnown = group.isKnown && group.scopes.length === 0
                if (!group.isKnown && group.scopes.length === 0) return null
                return (
                  <Card
                    key={group.status}
                    className="w-full overflow-hidden rounded-card border border-border bg-card shadow-e1"
                  >
                    <div className={`h-[3px] ${tone.accent}`} />
                    <CardHeader className="px-5 pb-3 pt-4">
                      <CardTitle className="flex items-center justify-between">
                        <span className="text-lg font-semibold">{group.status}</span>
                        <Badge variant={tone.badge} size="sm" className="num">
                          {group.scopes.length} {group.scopes.length === 1 ? "Scope" : "Scopes"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                      {showEmptyKnown ? (
                        <EmptyState
                          title={`No ${group.status.toLowerCase()} scopes`}
                          message="Scopes matching this status will appear here."
                          className="min-h-[150px] bg-surface-panel"
                        />
                      ) : (
                        <div className="overflow-x-auto">
                          <Table className="border-separate border-spacing-0">
                            <TableHeader className="bg-surface-panel">
                              <TableRow className="border-b border-border hover:bg-transparent">
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Client
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Scope ID
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Project
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                                  Value
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Scope Date
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                                  Scheduled
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                                  Actions
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.scopes.map((scope) => {
                                const scheduledPct = getScheduledCostPercentage(scope)
                                const value = sumScopeCostItems(scope.cost)
                                const gapLabel = scopeScheduleGapLabel(scope)
                                const rawStatus = scope.project_status
                                const known = resolveKnownScopeStatus(rawStatus)
                                return (
                                  <TableRow
                                    key={scope.id}
                                    className="interactive-row border-border"
                                  >
                                    <TableCell className="font-medium">
                                      {scope.client_name || "—"}
                                    </TableCell>
                                    <TableCell className="num font-mono text-xs">
                                      {scope.scope_id || "—"}
                                    </TableCell>
                                    <TableCell>
                                      <div className="min-w-0">
                                        <div className="font-medium">{scope.project_name || "—"}</div>
                                        {!known && rawStatus ? (
                                          <div className="text-xs text-muted-foreground">
                                            Status: {rawStatus}
                                          </div>
                                        ) : null}
                                        {gapLabel ? (
                                          <div className="text-xs text-status-behind-fg">{gapLabel}</div>
                                        ) : null}
                                      </div>
                                    </TableCell>
                                    <TableCell className="num text-right">
                                      {value > 0 ? formatAUD(value) : "—"}
                                    </TableCell>
                                    <TableCell className="num">
                                      {scope.scope_date ? formatDate(scope.scope_date) : "—"}
                                    </TableCell>
                                    <TableCell className="min-w-[10rem] text-right">
                                      <div className="ml-auto max-w-[9rem] space-y-1">
                                        <ProgressBar
                                          value={scheduledPct}
                                          max={100}
                                          size="sm"
                                          color={progressToneForScheduledPct(scheduledPct)}
                                          animated={false}
                                        />
                                        <span className="num text-xs text-muted-foreground">
                                          {Math.round(scheduledPct)}% of value
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex flex-wrap justify-end gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => router.push(`/scopes-of-work/${scope.id}`)}
                                        >
                                          <Eye className="mr-1 h-3.5 w-3.5" />
                                          View
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={pdfLoadingId === scope.id}
                                          onClick={() => void downloadPdf(scope)}
                                        >
                                          <Download className="mr-1 h-3.5 w-3.5" />
                                          PDF
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            router.push(`/scopes-of-work/${scope.id}/edit`)
                                          }
                                        >
                                          <Pencil className="mr-1 h-3.5 w-3.5" />
                                          Edit
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
