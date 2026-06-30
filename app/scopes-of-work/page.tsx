"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { format } from "date-fns"
import { PlusCircle, Search, FileText } from "lucide-react"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"

// Define the ScopeOfWork interface
interface ScopeOfWork {
  id: number;
  created_at: number;
  client_name: string;
  contact_name: string;
  contact_email: string;
  scope_date: string;
  scope_version: number;
  project_name: string;
  project_status: string;
  project_overview: string;
  deliverables: string;
  tasks_steps: string;
  timelines: string;
  responsibilities: string;
  requirements: string;
  assumptions: string;
  exclusions: string;
  cost: any;
  billing_schedule?: any;
  payment_terms_and_conditions: string;
}

type StatusTone = {
  badge: "secondary" | "info" | "success" | "warning" | "danger"
  bar: "default" | "success" | "warning" | "danger" | "info"
  accent: string
}

const STATUS_TONES: Record<string, StatusTone> = {
  Draft: {
    badge: "secondary",
    bar: "default",
    accent: "bg-muted",
  },
  Submitted: {
    badge: "info",
    bar: "info",
    accent: "bg-pacing-on-track",
  },
  Approved: {
    badge: "success",
    bar: "success",
    accent: "bg-pacing-ahead",
  },
  "In-Progress": {
    badge: "warning",
    bar: "warning",
    accent: "bg-pacing-behind",
  },
  Completed: {
    badge: "success",
    bar: "success",
    accent: "bg-pacing-ahead",
  },
  Cancelled: {
    badge: "danger",
    bar: "danger",
    accent: "bg-pacing-critical",
  },
}

function getStatusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? STATUS_TONES.Draft
}

function sumCostItems(value: unknown): number {
  let items = value
  if (typeof items === "string") {
    try {
      items = JSON.parse(items)
    } catch {
      return 0
    }
  }
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, item) => {
    const raw = typeof item === "object" && item !== null ? (item as { cost?: unknown }).cost : 0
    const amount = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? "0").replace(/[^0-9.-]/g, ""))
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

function getUsedPercentage(scope: ScopeOfWork): number {
  const totalCost = sumCostItems(scope.cost)
  if (totalCost <= 0) return 0
  const scheduledCost = sumCostItems(scope.billing_schedule)
  return Math.max(0, Math.min(100, (scheduledCost / totalCost) * 100))
}

// Define the project statuses
const PROJECT_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "In-Progress",
  "Completed",
  "Cancelled"
]

export default function ScopesOfWorkPage() {
  const router = useRouter()
  const [scopes, setScopes] = useState<ScopeOfWork[]>([])
  const [filteredScopes, setFilteredScopes] = useState<ScopeOfWork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Fetch scopes from the API
  useEffect(() => {
    const fetchScopes = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/scopes-of-work");
        if (!response.ok) {
          throw new Error("Failed to fetch scopes of work");
        }
        const data = await response.json();
        console.log("Fetched scopes data:", data);
  
        // Handle array or single object response
        const scopesData = Array.isArray(data) ? data : [data];
        console.log("Processed scopes data:", scopesData);

        // Capitalize first letter of status
        const processedScopes = scopesData.map((scope: ScopeOfWork) => ({
          ...scope,
          project_status: scope.project_status 
            ? scope.project_status.charAt(0).toUpperCase() + scope.project_status.slice(1)
            : "Draft"
        }));

        console.log("Final processed scopes:", processedScopes);
        setScopes(processedScopes as ScopeOfWork[]);
        setFilteredScopes(processedScopes as ScopeOfWork[]);
      } catch (err) {
        console.error("Error fetching scopes of work:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
  
    fetchScopes();
  }, []);

  // Filter scopes by status from filtered results
  const getScopesByStatus = (status: string) => {
    return filteredScopes.filter(scope => scope.project_status === status);
  };

  // Search functionality
  useEffect(() => {
    if (!searchTerm) {
      setFilteredScopes(scopes);
      return;
    }

    const filtered = scopes.filter(scope => {
      const searchLower = searchTerm.toLowerCase();
      return (
        scope.client_name?.toLowerCase().includes(searchLower) ||
        scope.project_name?.toLowerCase().includes(searchLower) ||
        scope.scope_date?.toLowerCase().includes(searchLower)
      );
    });

    setFilteredScopes(filtered);
  }, [searchTerm, scopes]);

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy')
    } catch (e) {
      return dateString
    }
  }

  return (
    <div className="w-full min-h-screen">
      <div className="w-full space-y-6 px-4 py-6 md:px-6">
        <MediaPlanEditorHero
          className="mb-2"
          title="Scopes of Work"
          Icon={FileText}
          detail={
            <p>Create, search, and edit scopes of work across all project statuses.</p>
          }
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search scopes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 pl-10"
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
              {error && (
                <ErrorState
                  title="Unable to load scopes"
                  message={error}
                />
              )}

              {loading ? (
                <div className="space-y-6">
                  {PROJECT_STATUSES.map((status) => (
                    <Card key={status} className="w-full overflow-hidden rounded-card border border-border bg-card shadow-e1">
                      <div className="h-[3px] bg-muted" />
                      <CardHeader className="pb-3 pt-4 px-5">
                        <CardTitle className="flex items-center justify-between">
                          <span className="text-lg font-semibold">{status}</span>
                          <Badge variant="secondary" size="sm">Loading</Badge>
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
                  {PROJECT_STATUSES.map((status) => {
                    const statusScopes = getScopesByStatus(status)
                    const tone = getStatusTone(status)
                    return (
                      <Card key={status} className="w-full overflow-hidden rounded-card border border-border bg-card shadow-e1">
                        <div className={`h-[3px] ${tone.accent}`} />
                        <CardHeader className="pb-3 pt-4 px-5">
                          <CardTitle className="flex items-center justify-between">
                            <span className="text-lg font-semibold">{status}</span>
                            <Badge variant={tone.badge} size="sm" className="num">
                              {statusScopes.length} {statusScopes.length === 1 ? "Scope" : "Scopes"}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-5 pb-5">
                          {statusScopes.length === 0 ? (
                            <EmptyState
                              title={`No ${status.toLowerCase()} scopes`}
                              message="Scopes matching this status will appear here."
                              className="min-h-[150px] bg-surface-panel"
                            />
                          ) : (
                            <div className="overflow-x-auto">
                              <Table className="border-separate border-spacing-0">
                                <TableHeader className="bg-surface-panel">
                                  <TableRow className="border-b border-border hover:bg-transparent">
                                    <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                                      Project Name
                                    </TableHead>
                                    <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                                      Scope Date
                                    </TableHead>
                                    <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                                      Version
                                    </TableHead>
                                    <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                                      Project Overview
                                    </TableHead>
                                    <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground text-right">
                                      Used
                                    </TableHead>
                                    <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground text-right">
                                      Actions
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {statusScopes.map((scope) => {
                                    const usedPercentage = getUsedPercentage(scope)
                                    return (
                                      <TableRow
                                        key={scope.id}
                                        className="border-b border-border transition-colors hover:bg-table-row-hover"
                                      >
                                        <TableCell className="font-medium">{scope.project_name}</TableCell>
                                        <TableCell className="num">{formatDate(scope.scope_date)}</TableCell>
                                        <TableCell className="num">{scope.scope_version || "N/A"}</TableCell>
                                        <TableCell>
                                          <div
                                            className="max-w-lg truncate text-muted-foreground"
                                            title={scope.project_overview}
                                          >
                                            {scope.project_overview || "N/A"}
                                          </div>
                                        </TableCell>
                                        <TableCell className="min-w-[10rem] text-right">
                                          <div className="ml-auto max-w-[9rem] space-y-1">
                                            <ProgressBar
                                              value={usedPercentage}
                                              max={100}
                                              size="sm"
                                              color={tone.bar}
                                              animated={false}
                                            />
                                            <span className="num text-xs text-muted-foreground">
                                              {Math.round(usedPercentage)}%
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="transition-colors hover:bg-table-row-hover"
                                            onClick={() => router.push(`/scopes-of-work/${scope.id}/edit`)}
                                          >
                                            Edit
                                          </Button>
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

