"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { PlusCircle, Search, FileText } from "lucide-react"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { cn } from "@/lib/utils"

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
  payment_terms_and_conditions: string;
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

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-gray-500"
      case "Submitted":
        return "bg-blue-500"
      case "Approved":
        return "bg-green-500"
      case "In-Progress":
        return "bg-purple-500"
      case "Completed":
        return "bg-teal-500"
      case "Cancelled":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusGradient = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-gradient-to-r from-gray-500 via-gray-400 to-gray-300"
      case "Submitted":
        return "bg-gradient-to-r from-blue-500 via-blue-400 to-blue-300"
      case "Approved":
        return "bg-gradient-to-r from-green-500 via-green-400 to-green-300"
      case "In-Progress":
        return "bg-gradient-to-r from-purple-500 via-purple-400 to-purple-300"
      case "Completed":
        return "bg-gradient-to-r from-teal-500 via-teal-400 to-teal-300"
      case "Cancelled":
        return "bg-gradient-to-r from-red-500 via-red-400 to-red-300"
      default:
        return "bg-gradient-to-r from-gray-500 via-gray-400 to-gray-300"
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
                <div className="bg-destructive/10 border border-destructive/30 text-destructive px-5 py-4 rounded-lg text-sm">
                  <p>{error}</p>
                </div>
              )}

              {loading ? (
                <div className="space-y-6">
                  {PROJECT_STATUSES.map((status) => (
                    <Card key={status} className="w-full border-0 shadow-md overflow-hidden">
                      <div className="h-1 bg-muted/40" />
                      <CardHeader className="pb-3 pt-4 px-5">
                        <CardTitle className="flex items-center justify-between">
                          <span className="text-lg font-semibold">{status}</span>
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-5 pb-5">
                        <div className="space-y-2">
                          <Skeleton className="h-8 w-full rounded" />
                          <Skeleton className="h-8 w-[95%] rounded" />
                          <Skeleton className="h-8 w-[90%] rounded" />
                          <Skeleton className="h-8 w-[85%] rounded" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {PROJECT_STATUSES.map((status) => {
                    const statusScopes = getScopesByStatus(status)
                    return (
                      <Card key={status} className="w-full border-0 shadow-md overflow-hidden">
                        <div className={cn("h-1", getStatusGradient(status))} />
                        <CardHeader className="pb-3 pt-4 px-5">
                          <CardTitle className="flex items-center justify-between">
                            <span className="text-lg font-semibold">{status}</span>
                            <Badge
                              className={cn(
                                getStatusBadgeColor(status),
                                "text-white text-xs font-medium"
                              )}
                            >
                              {statusScopes.length} {statusScopes.length === 1 ? "Scope" : "Scopes"}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-5 pb-5">
                          {statusScopes.length === 0 ? (
                            <p className="text-muted-foreground/70 text-center py-8 text-sm">
                              No {status.toLowerCase()} scopes of work
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-b border-border/40">
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
                                      Actions
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {statusScopes.map((scope) => (
                                    <TableRow
                                      key={scope.id}
                                      className="border-b border-border/20 hover:bg-muted/30 transition-colors"
                                    >
                                      <TableCell className="font-medium">{scope.project_name}</TableCell>
                                      <TableCell>{formatDate(scope.scope_date)}</TableCell>
                                      <TableCell>{scope.scope_version || "N/A"}</TableCell>
                                      <TableCell>
                                        <div
                                          className="max-w-lg truncate text-muted-foreground/80"
                                          title={scope.project_overview}
                                        >
                                          {scope.project_overview || "N/A"}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="hover:bg-muted/50 transition-colors"
                                          onClick={() => router.push(`/scopes-of-work/${scope.id}/edit`)}
                                        >
                                          Edit
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
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





