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
import { TableWithExport } from "@/components/ui/table-with-export"
import { PlusCircle, Search } from "lucide-react"
import { mediaTypeTheme } from "@/lib/utils"
import { compareValues, SortableTableHeader, SortDirection } from "@/components/ui/sortable-table-header"

// Define the MediaPlan interface to handle both MediaPlanMaster and MediaPlanVersions
interface MediaPlan {
  id: number;
  // Use standardized field name
  mp_client_name: string;
  mba_number: string;
  mp_campaignname?: string;
  campaign_name?: string;
  version_number: number;
  campaign_status: string;
  campaign_start_date: string;
  campaign_end_date: string;
  mp_campaignbudget: number;
  created_at: number;
  // Media type flags (these will come from the latest version)
  mp_television?: boolean;
  mp_radio?: boolean;
  mp_newspaper?: boolean;
  mp_magazines?: boolean;
  mp_ooh?: boolean;
  mp_cinema?: boolean;
  mp_digidisplay?: boolean;
  mp_digiaudio?: boolean;
  mp_digivideo?: boolean;
  mp_bvod?: boolean;
  mp_integration?: boolean;
  mp_search?: boolean;
  mp_socialmedia?: boolean;
  mp_progdisplay?: boolean;
  mp_progvideo?: boolean;
  mp_progbvod?: boolean;
  mp_progaudio?: boolean;
  mp_progooh?: boolean;
  mp_influencers?: boolean;
  // Additional fields that might be present
  brand?: string;
  client_contact?: string;
  po_number?: string;
  fixed_fee?: boolean;
}

type SortableValue = string | number | Date | boolean | null | undefined

type SortState = {
  column: string
  direction: SortDirection
}

// Define the campaign statuses in the new order
const CAMPAIGN_STATUSES = [
  "Booked",
  "Approved",
  "Planned",
  "Draft",
  "Completed",
  "Cancelled"
]

export default function MediaPlansPage() {
  const router = useRouter()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [filteredPlans, setFilteredPlans] = useState<MediaPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortStates, setSortStates] = useState<Record<string, SortState>>({})

  const getNextDirection = (current: SortDirection) =>
    current === "asc" ? "desc" : current === "desc" ? null : "asc"

  const toggleSortForStatus = (status: string, column: string) => {
    setSortStates(prev => {
      const prevState = prev[status] || { column: "", direction: null }
      const direction = prevState.column === column ? getNextDirection(prevState.direction) : "asc"
      return { ...prev, [status]: { column, direction } }
    })
  }

  const safeDate = (value: string) => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date(0) : d
  }

  const getSortDirection = (status: string, column: string): SortDirection =>
    sortStates[status]?.column === column ? sortStates[status]?.direction ?? null : null

  const planSelectors: Record<string, (plan: MediaPlan) => SortableValue> = {
    id: plan => plan.id,
    client: plan => plan.mp_client_name || "",
    mba: plan => plan.mba_number || "",
    campaign: plan => plan.mp_campaignname || plan.campaign_name || "",
    version: plan => plan.version_number,
    budget: plan => plan.mp_campaignbudget || 0,
    startDate: plan => safeDate(plan.campaign_start_date),
    endDate: plan => safeDate(plan.campaign_end_date),
    status: plan => plan.campaign_status || "",
  }

  const applySortForStatus = (plans: MediaPlan[], status: string) => {
    const sortState = sortStates[status]
    if (!sortState?.direction || !planSelectors[sortState.column]) return plans
    const select = planSelectors[sortState.column]
    return [...plans].sort((a, b) =>
      compareValues(select(a), select(b), sortState.direction as Exclude<SortDirection, null>)
    )
  }

  // Fetch media plans from the API
  useEffect(() => {
    const fetchMediaPlans = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/mediaplans");
        if (!response.ok) {
          throw new Error("Failed to fetch media plans");
        }
        const data = await response.json();
        console.log("Fetched media plans data:", data);
  
        // Handle both MediaPlanMaster and MediaPlanVersions data structures
        const mediaPlansData = Array.isArray(data) ? data : [data];
        console.log("Processed media plans data:", mediaPlansData);
        
        // Debug: Log media type flags for first plan
        if (mediaPlansData.length > 0) {
          console.log("First plan media type flags:", {
            mp_television: mediaPlansData[0].mp_television,
            mp_radio: mediaPlansData[0].mp_radio,
            mp_newspaper: mediaPlansData[0].mp_newspaper,
            mp_magazines: mediaPlansData[0].mp_magazines,
            mp_ooh: mediaPlansData[0].mp_ooh,
            mp_cinema: mediaPlansData[0].mp_cinema,
            mp_digidisplay: mediaPlansData[0].mp_digidisplay,
            mp_digiaudio: mediaPlansData[0].mp_digiaudio,
            mp_digivideo: mediaPlansData[0].mp_digivideo,
            mp_bvod: mediaPlansData[0].mp_bvod,
            mp_integration: mediaPlansData[0].mp_integration,
            mp_search: mediaPlansData[0].mp_search,
            mp_socialmedia: mediaPlansData[0].mp_socialmedia,
            mp_progdisplay: mediaPlansData[0].mp_progdisplay,
            mp_progvideo: mediaPlansData[0].mp_progvideo,
            mp_progbvod: mediaPlansData[0].mp_progbvod,
            mp_progaudio: mediaPlansData[0].mp_progaudio,
            mp_progooh: mediaPlansData[0].mp_progooh,
            mp_influencers: mediaPlansData[0].mp_influencers,
          });
        }

        // Helper function to normalize boolean values from API
        const normalizeBoolean = (value: any): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
          }
          if (typeof value === 'number') return value === 1;
          return false;
        };

        // Process campaigns to handle completed status based on end date
        const processedPlans = mediaPlansData.map(plan => {
          const today = new Date();
          const endDate = new Date(plan.campaign_end_date || plan.campaign_end_date);
          
          // Normalize all media type boolean flags
          const normalizedPlan = {
            ...plan,
            mp_television: normalizeBoolean(plan.mp_television),
            mp_radio: normalizeBoolean(plan.mp_radio),
            mp_newspaper: normalizeBoolean(plan.mp_newspaper),
            mp_magazines: normalizeBoolean(plan.mp_magazines),
            mp_ooh: normalizeBoolean(plan.mp_ooh),
            mp_cinema: normalizeBoolean(plan.mp_cinema),
            mp_digidisplay: normalizeBoolean(plan.mp_digidisplay),
            mp_digiaudio: normalizeBoolean(plan.mp_digiaudio),
            mp_digivideo: normalizeBoolean(plan.mp_digivideo),
            mp_bvod: normalizeBoolean(plan.mp_bvod),
            mp_integration: normalizeBoolean(plan.mp_integration),
            mp_search: normalizeBoolean(plan.mp_search),
            mp_socialmedia: normalizeBoolean(plan.mp_socialmedia),
            mp_progdisplay: normalizeBoolean(plan.mp_progdisplay),
            mp_progvideo: normalizeBoolean(plan.mp_progvideo),
            mp_progbvod: normalizeBoolean(plan.mp_progbvod),
            mp_progaudio: normalizeBoolean(plan.mp_progaudio),
            mp_progooh: normalizeBoolean(plan.mp_progooh),
            mp_influencers: normalizeBoolean(plan.mp_influencers),
          };
          
          // If campaign end date is in the past and status is not cancelled, mark as completed
          if (endDate < today && plan.campaign_status.toLowerCase() !== 'cancelled') {
            return {
              ...normalizedPlan,
              campaign_status: 'Completed'
            };
          }
          
          // Capitalize first letter of status
          return {
            ...normalizedPlan,
            campaign_status: plan.campaign_status.charAt(0).toUpperCase() + plan.campaign_status.slice(1)
          };
        });

        console.log("Final processed plans:", processedPlans);
        setMediaPlans(processedPlans as MediaPlan[]);
        setFilteredPlans(processedPlans as MediaPlan[]);
      } catch (err) {
        console.error("Error fetching media plans:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
  
    fetchMediaPlans();
  }, []);

  // Filter media plans by status from filtered results
  const getMediaPlansByStatus = (status: string) => {
    return filteredPlans.filter(plan => plan.campaign_status === status);
  };

  // Search functionality
  useEffect(() => {
    if (!searchTerm) {
      setFilteredPlans(mediaPlans);
      return;
    }

    const filtered = mediaPlans.filter(plan => {
      const searchLower = searchTerm.toLowerCase();
      return (
        plan.mp_client_name.toLowerCase().includes(searchLower) ||
        plan.campaign_name.toLowerCase().includes(searchLower) ||
        plan.mba_number.toLowerCase().includes(searchLower) ||
        (plan.brand && plan.brand.toLowerCase().includes(searchLower))
      );
    });

    setFilteredPlans(filtered);
  }, [searchTerm, mediaPlans]);

  // Get media type tags for a campaign
  const getMediaTypeTags = (plan: MediaPlan) => {
    // Helper to safely check if a media type is enabled
    const isEnabled = (value: any): boolean => {
      if (typeof value === 'boolean') return value === true;
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      }
      if (typeof value === 'number') return value === 1;
      return false;
    };

    const mediaTypes = [
      { key: "television", enabled: isEnabled(plan.mp_television) },
      { key: "radio", enabled: isEnabled(plan.mp_radio) },
      { key: "newspaper", enabled: isEnabled(plan.mp_newspaper) },
      { key: "magazines", enabled: isEnabled(plan.mp_magazines) },
      { key: "ooh", enabled: isEnabled(plan.mp_ooh) },
      { key: "cinema", enabled: isEnabled(plan.mp_cinema) },
      { key: "digidisplay", enabled: isEnabled(plan.mp_digidisplay) },
      { key: "digiaudio", enabled: isEnabled(plan.mp_digiaudio) },
      { key: "digivideo", enabled: isEnabled(plan.mp_digivideo) },
      { key: "bvod", enabled: isEnabled(plan.mp_bvod) },
      { key: "integration", enabled: isEnabled(plan.mp_integration) },
      { key: "search", enabled: isEnabled(plan.mp_search) },
      { key: "socialmedia", enabled: isEnabled(plan.mp_socialmedia) },
      { key: "progdisplay", enabled: isEnabled(plan.mp_progdisplay) },
      { key: "progvideo", enabled: isEnabled(plan.mp_progvideo) },
      { key: "progbvod", enabled: isEnabled(plan.mp_progbvod) },
      { key: "progaudio", enabled: isEnabled(plan.mp_progaudio) },
      { key: "progooh", enabled: isEnabled(plan.mp_progooh) },
      { key: "influencers", enabled: isEnabled(plan.mp_influencers) },
    ];

    const enabledTypes = mediaTypes.filter(({ enabled }) => enabled === true);
    
    // Log for debugging
    if (enabledTypes.length > 0) {
      console.log(`Plan ${plan.id} - Enabled media types:`, enabledTypes.map(t => t.key));
    }

    return enabledTypes.map(({ key }) => {
      const color = mediaTypeTheme.colors[key as keyof typeof mediaTypeTheme.colors];
      if (!color) {
        console.warn(`No color defined for media type: ${key}`);
      }
      return (
        <Badge
          key={key}
          className="mr-1 mb-1 text-white"
          style={{ backgroundColor: color || '#666666' }}
        >
          {key}
        </Badge>
      );
    });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

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
      case "Planned":
        return "bg-blue-500"
      case "Approved":
        return "bg-green-500"
      case "Booked":
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
          <h1 className="text-3xl font-bold">Media Plans</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search campaigns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button onClick={() => router.push("/mediaplans/create")}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Media Plan
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
            {CAMPAIGN_STATUSES.map((status) => (
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
            {CAMPAIGN_STATUSES.map((status) => {
              const plans = getMediaPlansByStatus(status)
              const sortedPlans = applySortForStatus(plans, status)
              return (
                <Card key={status} className="w-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{status}</span>
                      <Badge className={getStatusBadgeColor(status)}>
                        {plans.length} {plans.length === 1 ? "Plan" : "Plans"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {plans.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No {status.toLowerCase()} media plans</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <SortableTableHeader
                                label="ID"
                                direction={getSortDirection(status, "id")}
                                onToggle={() => toggleSortForStatus(status, "id")}
                                className="w-16"
                              />
                              <SortableTableHeader
                                label="Client Name"
                                direction={getSortDirection(status, "client")}
                                onToggle={() => toggleSortForStatus(status, "client")}
                                className="w-32"
                              />
                              <SortableTableHeader
                                label="MBA Number"
                                direction={getSortDirection(status, "mba")}
                                onToggle={() => toggleSortForStatus(status, "mba")}
                                className="w-24"
                              />
                              <SortableTableHeader
                                label="Campaign Name"
                                direction={getSortDirection(status, "campaign")}
                                onToggle={() => toggleSortForStatus(status, "campaign")}
                                className="w-40"
                              />
                              <SortableTableHeader
                                label="Version"
                                direction={getSortDirection(status, "version")}
                                onToggle={() => toggleSortForStatus(status, "version")}
                                className="w-20"
                              />
                              <SortableTableHeader
                                label="Budget"
                                direction={getSortDirection(status, "budget")}
                                onToggle={() => toggleSortForStatus(status, "budget")}
                                className="w-24"
                              />
                              <SortableTableHeader
                                label="Start Date"
                                direction={getSortDirection(status, "startDate")}
                                onToggle={() => toggleSortForStatus(status, "startDate")}
                                className="w-24"
                              />
                              <SortableTableHeader
                                label="End Date"
                                direction={getSortDirection(status, "endDate")}
                                onToggle={() => toggleSortForStatus(status, "endDate")}
                                className="w-24"
                              />
                              <TableHead className="w-48">Media Types</TableHead>
                              <TableHead className="w-20">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedPlans.map((plan) => (
                              <TableRow key={plan.id}>
                                <TableCell className="font-medium w-16">{plan.id}</TableCell>
                                <TableCell className="w-32">{plan.mp_client_name}</TableCell>
                                <TableCell className="w-24">{plan.mba_number}</TableCell>
                                <TableCell className="w-40">{plan.mp_campaignname || plan.campaign_name}</TableCell>
                                <TableCell className="w-20">{plan.version_number}</TableCell>
                                <TableCell className="w-24">{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                                <TableCell className="w-24">{formatDate(plan.campaign_start_date)}</TableCell>
                                <TableCell className="w-24">{formatDate(plan.campaign_end_date)}</TableCell>
                                <TableCell className="w-48">
                                  <div className="flex flex-wrap">
                                    {getMediaTypeTags(plan)}
                                  </div>
                                </TableCell>
                                <TableCell className="w-20">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => router.push(`/mediaplans/mba/${plan.mba_number}/edit?version=${plan.version_number}`)}
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

