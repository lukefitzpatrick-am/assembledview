"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { TableWithExport } from "@/components/ui/table-with-export"
import { PlusCircle } from "lucide-react"

// Define the MediaPlan interface
interface MediaPlan {
  id: number
  mp_clientname: string
  mp_campaignstatus: string
  mp_campaignname: string
  mp_campaigndates_start: string
  mp_campaigndates_end: string
  mp_brand: string
  mp_campaignbudget: number
  mp_television: boolean
  mp_radio: boolean
  mp_newspaper: boolean
  mp_magazines: boolean
  mp_ooh: boolean
  mp_cinema: boolean
  mp_digidisplay: boolean
  mp_digiaudio: boolean
  mp_digivideo: boolean
  mp_bvod: boolean
  mp_integration: boolean
  mp_search: boolean
  mp_socialmedia: boolean
  mp_progdisplay: boolean
  mp_progvideo: boolean
  mp_progbvod: boolean
  mp_progaudio: boolean
  mp_progooh: boolean
  mp_influencers: boolean
  created_date: string
  version_number: number
}

// Define the campaign statuses
const CAMPAIGN_STATUSES = [
  "Draft",
  "Planned",
  "Approved",
  "Booked",
  "Completed",
  "Cancelled"
]

export default function MediaPlansPage() {
  const router = useRouter()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch media plans from the API
  useEffect(() => {
    const fetchMediaPlans = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/mediaplans")
        
        if (!response.ok) {
          throw new Error("Failed to fetch media plans")
        }
        
        const data = await response.json()
        setMediaPlans(data)
      } catch (err) {
        console.error("Error fetching media plans:", err)
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchMediaPlans()
  }, [])

  // Filter media plans by status
  const getMediaPlansByStatus = (status: string) => {
    return mediaPlans.filter(plan => plan.mp_campaignstatus === status)
  }

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

  // Get media type badges
  const getMediaTypeBadges = (plan: MediaPlan) => {
    const badges = []
    
    if (plan.mp_television) badges.push("TV")
    if (plan.mp_radio) badges.push("Radio")
    if (plan.mp_newspaper) badges.push("Newspaper")
    if (plan.mp_magazines) badges.push("Magazines")
    if (plan.mp_ooh) badges.push("OOH")
    if (plan.mp_cinema) badges.push("Cinema")
    if (plan.mp_digidisplay) badges.push("Digital Display")
    if (plan.mp_digiaudio) badges.push("Digital Audio")
    if (plan.mp_digivideo) badges.push("Digital Video")
    if (plan.mp_bvod) badges.push("BVOD")
    if (plan.mp_integration) badges.push("Integration")
    if (plan.mp_search) badges.push("Search")
    if (plan.mp_socialmedia) badges.push("Social Media")
    if (plan.mp_progdisplay) badges.push("Programmatic Display")
    if (plan.mp_progvideo) badges.push("Programmatic Video")
    if (plan.mp_progbvod) badges.push("Programmatic BVOD")
    if (plan.mp_progaudio) badges.push("Programmatic Audio")
    if (plan.mp_progooh) badges.push("Programmatic OOH")
    if (plan.mp_influencers) badges.push("Influencers")
    
    return badges
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

  // Prepare data for CSV export
  const csvData = mediaPlans.map(plan => ({
    client_name: plan.mp_clientname,
    campaign_name: plan.mp_campaignname,
    brand: plan.mp_brand,
    start_date: formatDate(plan.mp_campaigndates_start),
    end_date: formatDate(plan.mp_campaigndates_end),
    media_types: getMediaTypeBadges(plan).join(", "),
    budget: formatCurrency(plan.mp_campaignbudget),
    status: plan.mp_campaignstatus
  }))

  // Define headers for CSV export
  const csvHeaders = {
    client_name: "Client Name",
    campaign_name: "Campaign Name",
    brand: "Brand",
    start_date: "Start Date",
    end_date: "End Date",
    media_types: "Media Types",
    budget: "Budget",
    status: "Status"
  }

  return (
    <div className="w-full min-h-screen">
      <div className="w-full px-4 py-6 space-y-4">
      <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Media Plans</h1>
          <Button onClick={() => router.push("/mediaplans/create")}>
          <PlusCircle className="mr-2 h-4 w-4" />
            Create Media Plan
          </Button>
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
                              <TableHead>Client Name</TableHead>
                              <TableHead>Campaign Name</TableHead>
                              <TableHead>Brand</TableHead>
                              <TableHead>Start Date</TableHead>
                              <TableHead>End Date</TableHead>
                              <TableHead>Media Types</TableHead>
                              <TableHead>Budget</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {plans.map((plan) => (
                              <TableRow key={plan.id}>
                                <TableCell className="font-medium">{plan.mp_clientname}</TableCell>
                                <TableCell>{plan.mp_campaignname}</TableCell>
                                <TableCell>{plan.mp_brand}</TableCell>
                                <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                                <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {getMediaTypeBadges(plan).map((badge, index) => (
                                      <Badge key={index} variant="outline" className="text-xs">
                                        {badge}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                                <TableCell>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => router.push(`/mediaplans/${plan.id}/edit`)}
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

