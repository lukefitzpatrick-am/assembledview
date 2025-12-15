"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { ArrowLeft, Download, FileText } from "lucide-react"

// Define the MediaPlan interface
interface MediaPlan {
  id: number
  mp_clientname: string
  mp_campaignstatus: string
  mp_campaignname: string
  mp_campaigndates_start: string
  mp_campaigndates_end: string
  mp_brand: string
  mp_clientcontact: string
  mp_ponumber: string
  mp_campaignbudget: number
  mbaidentifier: string
  mbanumber: string
  mp_fixedfee: boolean
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

export default function MediaPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [mediaPlan, setMediaPlan] = useState<MediaPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [id, setId] = useState<string>('')

  useEffect(() => {
    params.then(({ id: paramId }) => {
      setId(paramId)
    })
  }, [params])

  // Fetch media plan from the API
  useEffect(() => {
    if (!id) return
    
    const fetchMediaPlan = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/mediaplans/${id}`)
        
        if (!response.ok) {
          throw new Error("Failed to fetch media plan")
        }
        
        const data = await response.json()
        setMediaPlan(data)
      } catch (err) {
        console.error("Error fetching media plan:", err)
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchMediaPlan()
  }, [id])

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

  // Handle download media plan
  const handleDownloadMediaPlan = async () => {
    if (!mediaPlan) return
    
    try {
      setDownloading(true)
      
      // Prepare data for the API
      const mediaPlanData = {
        mp_clientname: mediaPlan.mp_clientname,
        mp_campaignstatus: mediaPlan.mp_campaignstatus,
        mp_campaignname: mediaPlan.mp_campaignname,
        mp_campaigndates_start: mediaPlan.mp_campaigndates_start,
        mp_campaigndates_end: mediaPlan.mp_campaigndates_end,
        mp_brand: mediaPlan.mp_brand,
        mp_clientcontact: mediaPlan.mp_clientcontact,
        mp_ponumber: mediaPlan.mp_ponumber,
        mp_campaignbudget: mediaPlan.mp_campaignbudget,
        mbaidentifier: mediaPlan.mbaidentifier,
        mbanumber: mediaPlan.mbanumber,
        mp_fixedfee: mediaPlan.mp_fixedfee,
        mp_television: mediaPlan.mp_television,
        mp_radio: mediaPlan.mp_radio,
        mp_newspaper: mediaPlan.mp_newspaper,
        mp_magazines: mediaPlan.mp_magazines,
        mp_ooh: mediaPlan.mp_ooh,
        mp_cinema: mediaPlan.mp_cinema,
        mp_digidisplay: mediaPlan.mp_digidisplay,
        mp_digiaudio: mediaPlan.mp_digiaudio,
        mp_digivideo: mediaPlan.mp_digivideo,
        mp_bvod: mediaPlan.mp_bvod,
        mp_integration: mediaPlan.mp_integration,
        mp_search: mediaPlan.mp_search,
        mp_socialmedia: mediaPlan.mp_socialmedia,
        mp_progdisplay: mediaPlan.mp_progdisplay,
        mp_progvideo: mediaPlan.mp_progvideo,
        mp_progbvod: mediaPlan.mp_progbvod,
        mp_progaudio: mediaPlan.mp_progaudio,
        mp_progooh: mediaPlan.mp_progooh,
        mp_influencers: mediaPlan.mp_influencers
      }
      
      // Send data to API
      const response = await fetch("/api/mediaplans/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mediaPlanData),
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate PDF")
      }
      
      // Get the PDF blob from the response
      const pdfBlob = await response.blob()
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(pdfBlob)
      
      // Create a temporary link element
      const link = document.createElement("a")
      link.href = url
      link.download = `${mediaPlan.mp_clientname}_${mediaPlan.mp_campaignname}_MediaPlan.pdf`
      
      // Append the link to the body, click it, and remove it
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Revoke the URL to free up memory
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error downloading media plan:", error)
      alert("Failed to download media plan. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  // Handle generate MBA
  const handleGenerateMBA = async () => {
    if (!mediaPlan) return
    
    try {
      setDownloading(true)
      
      // Prepare data for the API
      const mbaData = {
        mp_clientname: mediaPlan.mp_clientname,
        mp_campaignname: mediaPlan.mp_campaignname,
        mp_campaigndates_start: mediaPlan.mp_campaigndates_start,
        mp_campaigndates_end: mediaPlan.mp_campaigndates_end,
        mp_brand: mediaPlan.mp_brand,
        mp_clientcontact: mediaPlan.mp_clientcontact,
        mp_ponumber: mediaPlan.mp_ponumber,
        mp_campaignbudget: mediaPlan.mp_campaignbudget,
        mbaidentifier: mediaPlan.mbaidentifier,
        mbanumber: mediaPlan.mbanumber,
        mp_fixedfee: mediaPlan.mp_fixedfee,
        mp_television: mediaPlan.mp_television,
        mp_radio: mediaPlan.mp_radio,
        mp_newspaper: mediaPlan.mp_newspaper,
        mp_magazines: mediaPlan.mp_magazines,
        mp_ooh: mediaPlan.mp_ooh,
        mp_cinema: mediaPlan.mp_cinema,
        mp_digidisplay: mediaPlan.mp_digidisplay,
        mp_digiaudio: mediaPlan.mp_digiaudio,
        mp_digivideo: mediaPlan.mp_digivideo,
        mp_bvod: mediaPlan.mp_bvod,
        mp_integration: mediaPlan.mp_integration,
        mp_search: mediaPlan.mp_search,
        mp_socialmedia: mediaPlan.mp_socialmedia,
        mp_progdisplay: mediaPlan.mp_progdisplay,
        mp_progvideo: mediaPlan.mp_progvideo,
        mp_progbvod: mediaPlan.mp_progbvod,
        mp_progaudio: mediaPlan.mp_progaudio,
        mp_progooh: mediaPlan.mp_progooh,
        mp_influencers: mediaPlan.mp_influencers
      }
      
      // Send data to API
      const response = await fetch("/api/mba/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mbaData),
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate MBA")
      }
      
      // Get the PDF blob from the response
      const pdfBlob = await response.blob()
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(pdfBlob)
      
      // Create a temporary link element
      const link = document.createElement("a")
      link.href = url
      link.download = `${mediaPlan.mp_clientname}_${mediaPlan.mp_campaignname}_MBA.pdf`
      
      // Append the link to the body, click it, and remove it
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Revoke the URL to free up memory
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error generating MBA:", error)
      alert("Failed to generate MBA. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="w-full min-h-screen">
      <div className="w-full px-4 py-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">{mediaPlan?.mp_campaignname || "Media Plan Details"}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadMediaPlan}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button variant="outline" onClick={handleGenerateMBA}>
              <FileText className="mr-2 h-4 w-4" />
              Generate MBA
            </Button>
            <Button onClick={() => router.push(`/mediaplans/${id}/edit`)}>
              Edit Media Plan
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
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : mediaPlan ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{mediaPlan.mp_campaignname}</CardTitle>
                  <Badge className={getStatusBadgeColor(mediaPlan.mp_campaignstatus)}>
                    {mediaPlan.mp_campaignstatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Client Information</h3>
                    <div className="space-y-2">
                      <p><span className="font-medium">Client Name:</span> {mediaPlan.mp_clientname}</p>
                      <p><span className="font-medium">Brand:</span> {mediaPlan.mp_brand}</p>
                      <p><span className="font-medium">Client Contact:</span> {mediaPlan.mp_clientcontact}</p>
                      <p><span className="font-medium">PO Number:</span> {mediaPlan.mp_ponumber}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Campaign Details</h3>
                    <div className="space-y-2">
                      <p><span className="font-medium">Campaign Name:</span> {mediaPlan.mp_campaignname}</p>
                      <p><span className="font-medium">Start Date:</span> {formatDate(mediaPlan.mp_campaigndates_start)}</p>
                      <p><span className="font-medium">End Date:</span> {formatDate(mediaPlan.mp_campaigndates_end)}</p>
                      <p><span className="font-medium">Budget:</span> {formatCurrency(mediaPlan.mp_campaignbudget)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Media Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {getMediaTypeBadges(mediaPlan).map((badge, index) => (
                    <Badge key={index} className="text-sm">
                      {badge}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>MBA Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p><span className="font-medium">MBA Identifier:</span> {mediaPlan.mbaidentifier || "Not set"}</p>
                  <p><span className="font-medium">MBA Number:</span> {mediaPlan.mbanumber || "Not set"}</p>
                  <p><span className="font-medium">Fixed Fee:</span> {mediaPlan.mp_fixedfee ? "Yes" : "No"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-lg">Media plan not found</p>
          </div>
        )}
      </div>
    </div>
  )
} 