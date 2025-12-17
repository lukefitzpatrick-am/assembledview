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
import { PlusCircle, Search } from "lucide-react"

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

  return (
    <div className="w-full min-h-screen">
      <div className="w-full px-4 py-6 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Scopes of Work</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search scopes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button onClick={() => router.push("/scopes-of-work/create")}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Scope
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {PROJECT_STATUSES.map((status) => (
              <Card key={status}>
                <CardHeader>
                  <CardTitle>{status}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {PROJECT_STATUSES.map((status) => {
              const statusScopes = getScopesByStatus(status)
              return (
                <Card key={status} className="w-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{status}</span>
                      <Badge className={getStatusBadgeColor(status)}>
                        {statusScopes.length} {statusScopes.length === 1 ? "Scope" : "Scopes"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {statusScopes.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No {status.toLowerCase()} scopes of work</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-40">Project Name</TableHead>
                              <TableHead className="w-32">Scope Date</TableHead>
                              <TableHead className="w-24">Version</TableHead>
                              <TableHead className="w-96">Project Overview</TableHead>
                              <TableHead className="w-20">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {statusScopes.map((scope) => (
                              <TableRow key={scope.id}>
                                <TableCell className="font-medium w-40">{scope.project_name}</TableCell>
                                <TableCell className="w-32">{formatDate(scope.scope_date)}</TableCell>
                                <TableCell className="w-24">{scope.scope_version || "N/A"}</TableCell>
                                <TableCell className="w-96">
                                  <div className="max-w-md truncate" title={scope.project_overview}>
                                    {scope.project_overview || "N/A"}
                                  </div>
                                </TableCell>
                                <TableCell className="w-20">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
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
  )
}





