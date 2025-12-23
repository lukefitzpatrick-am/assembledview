"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BarChart3, TrendingUp, ShoppingCart, Users } from "lucide-react"
import { format } from "date-fns"
import { PieChart } from '@/components/charts/PieChart'
import { useUser } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import { AuthPageLoading } from '@/components/AuthLoadingState'
import axios from 'axios'
import { mediaTypeTheme } from '@/lib/utils'
import { compareValues, SortableTableHeader, SortDirection } from "@/components/ui/sortable-table-header"

// Define the type for a MediaPlan object
type MediaPlan = {
  id: number
  mp_clientname: string
  mp_campaignname: string
  mp_mba_number: string
  mp_version: number
  mp_brand: string
  mp_campaignstatus: string
  mp_campaigndates_start: string
  mp_campaigndates_end: string
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
  billingSchedule?: any
}

// Define the ScopeOfWork interface
interface ScopeOfWork {
  id: number
  created_at: number
  client_name: string
  contact_name: string
  contact_email: string
  scope_date: string
  scope_version: number
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
  cost: any
  payment_terms_and_conditions: string
}

// Line item interface for spend calculations
interface LineItem {
  id: number
  mba_number: string
  network?: string
  platform?: string
  station?: string
  bursts_json?: string
  budget_includes_fees?: boolean
  client_pays_for_media?: boolean
  [key: string]: any
}

type SortableValue = string | number | Date | boolean | null | undefined

type SortState = {
  column: string
  direction: SortDirection
}

// --- HELPER FUNCTIONS ---

// Helper function to get the current Australian Financial Year dates
const getCurrentFinancialYear = () => {
  const today = new Date()
  const currentMonth = today.getMonth() // 0-11 (Jan-Dec)
  const currentYear = today.getFullYear()

  let startYear
  if (currentMonth >= 6) { // July is month 6
    startYear = currentYear
  } else {
    startYear = currentYear - 1
  }

  const startDate = new Date(startYear, 6, 1) // July 1st
  const endDate = new Date(startYear + 1, 5, 30) // June 30th

  return { startDate, endDate }
}

// Helper function to format currency to AUD
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount)
}

// Helper function to format dates
const formatDate = (dateString: string) => {
  return format(new Date(dateString), "MMM d, yyyy")
}

// Helper function to calculate media cost from bursts
const calculateMediaCostFromBursts = (bursts: any[], feePercent: number = 0, budgetIncludesFees: boolean = false): number => {
  if (!bursts || !Array.isArray(bursts)) return 0

  let totalMedia = 0
  bursts.forEach((burst) => {
    const budget = parseFloat(String(burst.budget || burst.budget_amount || 0).replace(/[^0-9.]/g, "")) || 0
    if (budgetIncludesFees) {
      // Budget is gross, split into media and fee
      const base = budget / (1 + (feePercent || 0) / 100)
      totalMedia += base
    } else {
      // Budget is net media
      totalMedia += budget
    }
  })
  return totalMedia
}

// Helper function to get publisher name from line item
const getPublisherName = (lineItem: LineItem): string => {
  return lineItem.network || lineItem.platform || lineItem.station || "Unknown"
}

// Helper function to fetch all line items for a campaign
const fetchLineItemsForCampaign = async (mbaNumber: string, versionNumber: number): Promise<LineItem[]> => {
  const MEDIA_PLANS_BASE_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
  const allLineItems: LineItem[] = []

  const lineItemEndpoints = [
    'television_line_items',
    'radio_line_items',
    'search_line_items',
    'social_media_line_items',
    'newspaper_line_items',
    'magazines_line_items',
    'ooh_line_items',
    'cinema_line_items',
    'digital_display_line_items',
    'digital_audio_line_items',
    'digital_video_line_items',
    'bvod_line_items',
    'integration_line_items',
    'prog_display_line_items',
    'prog_video_line_items',
    'prog_bvod_line_items',
    'prog_audio_line_items',
    'prog_ooh_line_items',
    'influencers_line_items'
  ]

  try {
    // Query ONLY by mba_number to scan entire database, then filter by version_number in JavaScript
    const promises = lineItemEndpoints.map(endpoint =>
      axios.get(`${MEDIA_PLANS_BASE_URL}/${endpoint}?mba_number=${mbaNumber}`)
        .then(response => {
          const allItems = Array.isArray(response.data) ? response.data : []
          // Filter by version_number/mp_plannumber in JavaScript
          return allItems.filter((item: any) => {
            const itemVersion = typeof item.version_number === 'string' 
              ? parseInt(item.version_number, 10) 
              : item.version_number
            const itemPlan = typeof item.mp_plannumber === 'string'
              ? parseInt(item.mp_plannumber, 10)
              : item.mp_plannumber
            return (itemVersion === versionNumber || itemPlan === versionNumber) && 
                   item.mba_number === mbaNumber
          })
        })
        .catch(() => [])
    )

    const results = await Promise.all(promises)
    results.forEach(items => {
      if (Array.isArray(items)) {
        allLineItems.push(...items)
      }
    })
  } catch (error) {
    console.error(`Error fetching line items for ${mbaNumber}:`, error)
  }

  return allLineItems
}

// Helper function to parse billing schedule amount (e.g., "$40,000.00" → 40000.00)
const parseBillingScheduleAmount = (amountStr: string | number): number => {
  if (typeof amountStr === "number") {
    return amountStr
  }
  if (!amountStr || typeof amountStr !== "string") {
    return 0
  }
  // Remove currency symbols, commas, and whitespace, then parse
  const cleaned = amountStr.replace(/[$,]/g, "").trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

// Helper function to parse month year string to Date
const parseMonthYear = (monthYear: string): Date | null => {
  try {
    // Format: "January 2025" or "Jan 2025"
    const parts = monthYear.trim().split(' ')
    if (parts.length !== 2) return null
    
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december']
    const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    
    const monthStr = parts[0].toLowerCase()
    const year = parseInt(parts[1])
    
    let monthIndex = monthNames.indexOf(monthStr)
    if (monthIndex === -1) {
      monthIndex = monthAbbr.indexOf(monthStr)
    }
    
    if (monthIndex === -1 || isNaN(year)) return null
    
    return new Date(year, monthIndex, 1)
  } catch (e) {
    return null
  }
}

// Helper function to extract unique publishers (header1) from billing schedule
const extractPublishersFromBillingSchedule = (billingSchedule: any): Set<string> => {
  const publishers = new Set<string>()
  
  if (!billingSchedule) return publishers
  
  let scheduleArray: any[] = []
  
  // Handle different billing schedule structures
  if (Array.isArray(billingSchedule)) {
    scheduleArray = billingSchedule
  } else if (billingSchedule.months && Array.isArray(billingSchedule.months)) {
    scheduleArray = billingSchedule.months
  } else {
    return publishers
  }
  
  // Iterate through all months and extract header1 values
  scheduleArray.forEach((entry: any) => {
    if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
      entry.mediaTypes.forEach((mediaType: any) => {
        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          mediaType.lineItems.forEach((lineItem: any) => {
            if (lineItem.header1 && lineItem.header1.trim() !== '') {
              publishers.add(lineItem.header1.trim())
            }
          })
        }
      })
    }
  })
  
  return publishers
}

// Helper function to extract spend data from billing schedule for financial year
const extractSpendFromBillingSchedule = (
  billingSchedule: any,
  fyStartDate: Date,
  fyEndDate: Date
): { publisherSpend: Record<string, number>, totalSpend: number } => {
  const publisherSpend: Record<string, number> = {}
  let totalSpend = 0
  
  if (!billingSchedule) return { publisherSpend, totalSpend }
  
  let scheduleArray: any[] = []
  
  // Handle different billing schedule structures
  if (Array.isArray(billingSchedule)) {
    scheduleArray = billingSchedule
  } else if (billingSchedule.months && Array.isArray(billingSchedule.months)) {
    scheduleArray = billingSchedule.months
  } else {
    return { publisherSpend, totalSpend }
  }
  
  // Iterate through all months and extract amounts for months in financial year
  scheduleArray.forEach((entry: any) => {
    const monthDate = parseMonthYear(entry.monthYear)
    if (!monthDate) return
    
    // Check if month falls within financial year
    // We check if the month overlaps with the financial year period
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    
    // Month overlaps with financial year if it intersects
    if (monthStart <= fyEndDate && monthEnd >= fyStartDate) {
      if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
        entry.mediaTypes.forEach((mediaType: any) => {
          if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
            mediaType.lineItems.forEach((lineItem: any) => {
              const amount = parseBillingScheduleAmount(lineItem.amount)
              if (amount > 0 && lineItem.header1 && lineItem.header1.trim() !== '') {
                const publisher = lineItem.header1.trim()
                publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
                totalSpend += amount
              }
            })
          }
        })
      }
    }
  })
  
  return { publisherSpend, totalSpend }
}

// Helper function to transform API response to MediaPlan type
const transformMediaPlanData = (apiData: any[]): MediaPlan[] => {
  return apiData.map((item: any) => {
    // Parse billingSchedule if it's a string
    let billingSchedule = item.billingSchedule
    if (billingSchedule && typeof billingSchedule === 'string') {
      try {
        billingSchedule = JSON.parse(billingSchedule)
      } catch (e) {
        console.warn('Error parsing billingSchedule:', e)
        billingSchedule = null
      }
    }
    
    return {
      id: item.id || 0,
      mp_clientname: item.mp_client_name || item.mp_clientname || '',
      mp_campaignname: item.campaign_name || item.mp_campaignname || '',
      mp_mba_number: item.mba_number || item.mp_mba_number || '',
      mp_version: item.version_number || item.mp_version || 1,
      mp_brand: item.brand || '',
      mp_campaignstatus: item.campaign_status || item.mp_campaignstatus || '',
      mp_campaigndates_start: item.campaign_start_date || item.mp_campaigndates_start || '',
      mp_campaigndates_end: item.campaign_end_date || item.mp_campaigndates_end || '',
      mp_campaignbudget: item.mp_campaignbudget || 0,
      mp_television: item.mp_television || false,
      mp_radio: item.mp_radio || false,
      mp_newspaper: item.mp_newspaper || false,
      mp_magazines: item.mp_magazines || false,
      mp_ooh: item.mp_ooh || false,
      mp_cinema: item.mp_cinema || false,
      mp_digidisplay: item.mp_digidisplay || false,
      mp_digiaudio: item.mp_digiaudio || false,
      mp_digivideo: item.mp_digivideo || false,
      mp_bvod: item.mp_bvod || false,
      mp_integration: item.mp_integration || false,
      mp_search: item.mp_search || false,
      mp_socialmedia: item.mp_socialmedia || false,
      mp_progdisplay: item.mp_progdisplay || false,
      mp_progvideo: item.mp_progvideo || false,
      mp_progbvod: item.mp_progbvod || false,
      mp_progaudio: item.mp_progaudio || false,
      mp_progooh: item.mp_progooh || false,
      mp_influencers: item.mp_influencers || false,
      billingSchedule: billingSchedule || undefined,
    }
  })
}

export default function DashboardPage() {
  const { user, isLoading, error: authError } = useUser()
  const router = useRouter()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [scopes, setScopes] = useState<ScopeOfWork[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [publisherSpendData, setPublisherSpendData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [clientSpendData, setClientSpendData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [liveCampaignSort, setLiveCampaignSort] = useState<SortState>({ column: "", direction: null })
  const [liveScopesSort, setLiveScopesSort] = useState<SortState>({ column: "", direction: null })
  const [dueSoonSort, setDueSoonSort] = useState<SortState>({ column: "", direction: null })
  const [finishedSort, setFinishedSort] = useState<SortState>({ column: "", direction: null })

  const getNextDirection = (current: SortDirection) =>
    current === "asc" ? "desc" : current === "desc" ? null : "asc"

  const toggleSort = (
    column: string,
    sort: SortState,
    setSort: React.Dispatch<React.SetStateAction<SortState>>
  ) => {
    setSort(prev => {
      const direction = prev.column === column ? getNextDirection(prev.direction) : "asc"
      return { column, direction }
    })
  }

  const applySort = <T,>(
    data: T[],
    sortState: SortState,
    selectors: Record<string, (item: T) => SortableValue>
  ): T[] => {
    const { column, direction } = sortState
    if (!direction || !selectors[column]) return data
    const select = selectors[column]
    return [...data].sort((a, b) =>
      compareValues(select(a), select(b), direction as Exclude<SortDirection, null>)
    )
  }

  // State for the dashboard overview metrics
  const [dashboardMetrics, setDashboardMetrics] = useState([
    {
      title: "Total Live Campaigns",
      value: "0",
      icon: BarChart3,
      tooltip: "Sum of campaigns with status booked or approved",
      color: "bg-blue-500",
    },
    {
      title: "Total Live Scopes of Work",
      value: "0",
      icon: TrendingUp,
      tooltip: "Sum of scopes with status Approved or In-Progress",
      color: "bg-green-500",
    },
    {
      title: "Total Live Clients",
      value: "0",
      icon: Users,
      tooltip: "Sum of unique clients with live activity from campaigns and scopes",
      color: "bg-purple-500",
    },
    {
      title: "Total Live Publishers",
      value: "0",
      icon: ShoppingCart,
      tooltip: "Sum of unique publishers with live activity from campaigns",
      color: "bg-amber-500",
    },
  ])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push('/auth/login?returnTo=/dashboard')
    }
  }, [mounted, isLoading, user, router])

  // Extract fetchData function so it can be reused by retry button
  const fetchData = async () => {
    try {
      setLoading(true)
      setFetchError(null)
      console.log('Dashboard: Starting data fetch...')

      // Fetch media plans and scopes
      const [mediaPlansResponse, scopesResponse] = await Promise.all([
        fetch("/api/media_plans").catch(err => {
          console.error('Dashboard: Error fetching media plans:', err)
          throw new Error('Failed to fetch media plans')
        }),
        fetch("/api/scopes-of-work").catch(err => {
          console.error('Dashboard: Error fetching scopes:', err)
          return { ok: false, json: async () => [] }
        })
      ])

      // Handle media plans response
      if (!mediaPlansResponse.ok) {
        const errorText = await mediaPlansResponse.text()
        console.error('Dashboard: Media plans API error:', mediaPlansResponse.status, errorText)
        throw new Error(`Failed to fetch media plans: ${mediaPlansResponse.status}`)
      }

      const mediaPlansRaw = await mediaPlansResponse.json()
      console.log('Dashboard: Media plans raw response:', mediaPlansRaw)
      const mediaPlansData = transformMediaPlanData(Array.isArray(mediaPlansRaw) ? mediaPlansRaw : [])
      console.log('Dashboard: Transformed media plans:', mediaPlansData.length, 'items')

      // Handle scopes response
      let scopesData: ScopeOfWork[] = []
      if (scopesResponse.ok) {
        const scopesRaw = await scopesResponse.json()
        scopesData = Array.isArray(scopesRaw) ? scopesRaw : []
        console.log('Dashboard: Scopes data:', scopesData.length, 'items')
      } else {
        console.warn('Dashboard: Scopes API returned error, using empty array')
      }

      setMediaPlans(mediaPlansData)
      setScopes(scopesData)

      // Get latest versions of campaigns
      const latestVersionsMap = new Map<string, MediaPlan>()
      mediaPlansData.forEach(plan => {
        const existing = latestVersionsMap.get(plan.mp_mba_number)
        if (!existing || plan.mp_version > existing.mp_version) {
          latestVersionsMap.set(plan.mp_mba_number, plan)
        }
      })
      const latestPlans = Array.from(latestVersionsMap.values())

      // Filter live campaigns (booked/approved)
      const liveStatuses = ['booked', 'approved']
      const liveCampaigns = latestPlans.filter(plan =>
        plan.mp_campaignstatus &&
        liveStatuses.includes(plan.mp_campaignstatus.toLowerCase())
      )

      // Filter live scopes (Approved/In-Progress)
      const liveScopes = scopesData.filter(scope =>
        scope.project_status === 'Approved' || scope.project_status === 'In-Progress'
      )

      // Get unique clients from live campaigns and scopes
      const liveClients = new Set<string>()
      liveCampaigns.forEach(campaign => {
        if (campaign.mp_clientname) liveClients.add(campaign.mp_clientname)
      })
      liveScopes.forEach(scope => {
        if (scope.client_name) liveClients.add(scope.client_name)
      })

      // Calculate metrics
      const totalLiveCampaigns = liveCampaigns.length
      const totalLiveScopes = liveScopes.length
      const totalLiveClients = liveClients.size

      // Get financial year dates for spend calculations
      const { startDate: fyStartDate, endDate: fyEndDate } = getCurrentFinancialYear()
      const liveCampaignsInFY = liveCampaigns.filter(plan => {
        const planStartDate = new Date(plan.mp_campaigndates_start)
        const planEndDate = new Date(plan.mp_campaigndates_end)
        return planStartDate <= fyEndDate && planEndDate >= fyStartDate
      })

      // Count publishers from ALL live campaigns using billing schedule (not just financial year)
      const allPublishersSet = new Set<string>()
      for (const campaign of liveCampaigns) {
        if (campaign.billingSchedule) {
          const publishers = extractPublishersFromBillingSchedule(campaign.billingSchedule)
          publishers.forEach(publisher => allPublishersSet.add(publisher))
        }
      }
      const totalLivePublishers = allPublishersSet.size

      // Calculate spend data from billing schedule for campaigns in financial year (for pie charts)
      const publisherSpend: Record<string, number> = {}
      const clientSpend: Record<string, number> = {}

      // Process billing schedule for all live campaigns in financial year
      for (const campaign of liveCampaignsInFY) {
        if (campaign.billingSchedule) {
          try {
            const { publisherSpend: campaignPublisherSpend, totalSpend: campaignTotalSpend } = 
              extractSpendFromBillingSchedule(campaign.billingSchedule, fyStartDate, fyEndDate)
            
            // Aggregate by publisher
            Object.entries(campaignPublisherSpend).forEach(([publisher, amount]) => {
              publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
            })
            
            // Aggregate by client
            if (campaign.mp_clientname && campaignTotalSpend > 0) {
              clientSpend[campaign.mp_clientname] = (clientSpend[campaign.mp_clientname] || 0) + campaignTotalSpend
            }
          } catch (error) {
            console.error(`Error processing billing schedule for campaign ${campaign.mp_mba_number}:`, error)
          }
        }
      }

      // Prepare pie chart data
      const publisherSpendArray = Object.entries(publisherSpend)
        .map(([name, value]) => ({
          name,
          value: Math.round(value),
          percentage: 0 // Will calculate after
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)

      const totalPublisherSpend = publisherSpendArray.reduce((sum, item) => sum + item.value, 0)
      publisherSpendArray.forEach(item => {
        item.percentage = totalPublisherSpend > 0 ? (item.value / totalPublisherSpend) * 100 : 0
      })

      const clientSpendArray = Object.entries(clientSpend)
        .map(([name, value]) => ({
          name,
          value: Math.round(value),
          percentage: 0
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)

      const totalClientSpend = clientSpendArray.reduce((sum, item) => sum + item.value, 0)
      clientSpendArray.forEach(item => {
        item.percentage = totalClientSpend > 0 ? (item.value / totalClientSpend) * 100 : 0
      })

      setPublisherSpendData(publisherSpendArray)
      setClientSpendData(clientSpendArray)

      // Update metrics
      setDashboardMetrics([
        {
          title: 'Total Live Campaigns',
          value: totalLiveCampaigns.toString(),
          icon: BarChart3,
          tooltip: 'Sum of campaigns with status booked or approved',
          color: 'bg-blue-500'
        },
        {
          title: 'Total Live Scopes of Work',
          value: totalLiveScopes.toString(),
          icon: TrendingUp,
          tooltip: 'Sum of scopes with status Approved or In-Progress',
          color: 'bg-green-500'
        },
        {
          title: 'Total Live Clients',
          value: totalLiveClients.toString(),
          icon: Users,
          tooltip: 'Sum of unique clients with live activity',
          color: 'bg-purple-500'
        },
        {
          title: 'Total Live Publishers',
          value: totalLivePublishers.toString(),
          icon: ShoppingCart,
          tooltip: 'Sum of unique publishers with live activity',
          color: 'bg-amber-500'
        },
      ])

    } catch (error) {
      console.error("Dashboard: Error fetching data:", error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while loading dashboard data'
      setFetchError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mounted && user) {
      fetchData()
    }
  }, [mounted, user])

  if (!mounted || isLoading) {
    return <AuthPageLoading message="Loading dashboard..." />
  }

  if (authError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">Error loading dashboard: {authError.message}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Dashboard</h2>
            <p className="text-red-600 mb-4">{fetchError}</p>
            <button
              onClick={() => {
                setFetchError(null)
                fetchData()
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to login
  }

  // Helper functions for filtering campaigns
  const getLiveCampaigns = () => {
    const latestVersionsMap = new Map<string, MediaPlan>()
    mediaPlans.forEach(plan => {
      const existing = latestVersionsMap.get(plan.mp_mba_number)
      if (!existing || plan.mp_version > existing.mp_version) {
        latestVersionsMap.set(plan.mp_mba_number, plan)
      }
    })
    const latestPlans = Array.from(latestVersionsMap.values())
    const liveStatuses = ['booked', 'approved']
    return latestPlans.filter(plan =>
      plan.mp_campaignstatus &&
      liveStatuses.includes(plan.mp_campaignstatus.toLowerCase())
    )
  }

  const getLiveScopes = () => {
    return scopes.filter(scope =>
      scope.project_status === 'Approved' || scope.project_status === 'In-Progress'
    )
  }

  const getCampaignsDueToStart = () => {
    const today = new Date()
    const sevenDaysFromNow = new Date(today)
    sevenDaysFromNow.setDate(today.getDate() + 7)

    const latestVersionsMap = new Map<string, MediaPlan>()
    mediaPlans.forEach(plan => {
      const existing = latestVersionsMap.get(plan.mp_mba_number)
      if (!existing || plan.mp_version > existing.mp_version) {
        latestVersionsMap.set(plan.mp_mba_number, plan)
      }
    })
    const latestPlans = Array.from(latestVersionsMap.values())

    return latestPlans.filter(plan => {
      const startDate = new Date(plan.mp_campaigndates_start)
      return startDate >= today && startDate <= sevenDaysFromNow
    })
  }

  const getCampaignsFinishedRecently = () => {
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const latestVersionsMap = new Map<string, MediaPlan>()
    mediaPlans.forEach(plan => {
      const existing = latestVersionsMap.get(plan.mp_mba_number)
      if (!existing || plan.mp_version > existing.mp_version) {
        latestVersionsMap.set(plan.mp_mba_number, plan)
      }
    })
    const latestPlans = Array.from(latestVersionsMap.values())

    return latestPlans.filter(plan => {
      const endDate = new Date(plan.mp_campaigndates_end)
      return endDate >= thirtyDaysAgo && endDate <= today
    })
  }

  const safeDate = (value: string) => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date(0) : d
  }

  const getStatusBadgeColor = (status: string) => {
    if (!status) return "bg-gray-500"
    switch (status.toLowerCase()) {
      case "booked": return "bg-purple-500"
      case "approved": return "bg-green-500"
      case "planned": return "bg-blue-500"
      case "draft": return "bg-gray-500"
      case "completed": return "bg-teal-500"
      case "cancelled": return "bg-red-500"
      case "in-progress": return "bg-purple-500"
      default: return "bg-gray-500"
    }
  }

  const getMediaTypeTags = (plan: MediaPlan) => {
    // Helper to safely check if a media type is enabled
    const isEnabled = (value: any): boolean => {
      if (typeof value === 'boolean') return value === true
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1'
      }
      if (typeof value === 'number') return value === 1
      return false
    }

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
    ]

    const enabledTypes = mediaTypes.filter(({ enabled }) => enabled === true)

    return enabledTypes.map(({ key }) => {
      const color = mediaTypeTheme.colors[key as keyof typeof mediaTypeTheme.colors]
      if (!color) {
        console.warn(`No color defined for media type: ${key}`)
      }
      return (
        <Badge
          key={key}
          className="mr-1 mb-1 text-white"
          style={{ backgroundColor: color || '#666666' }}
        >
          {key}
        </Badge>
      )
    })
  }

  const liveCampaigns = getLiveCampaigns()
  const liveScopes = getLiveScopes()
  const campaignsDueToStart = getCampaignsDueToStart()
  const campaignsFinishedRecently = getCampaignsFinishedRecently()

  const liveCampaignSelectors = {
    client: (plan: MediaPlan): SortableValue => plan.mp_clientname || "",
    campaign: (plan: MediaPlan): SortableValue => plan.mp_campaignname || "",
    mba: (plan: MediaPlan): SortableValue => plan.mp_mba_number || "",
    startDate: (plan: MediaPlan): SortableValue => safeDate(plan.mp_campaigndates_start),
    endDate: (plan: MediaPlan): SortableValue => safeDate(plan.mp_campaigndates_end),
    budget: (plan: MediaPlan): SortableValue => plan.mp_campaignbudget || 0,
    version: (plan: MediaPlan): SortableValue => plan.mp_version || 0,
    status: (plan: MediaPlan): SortableValue => plan.mp_campaignstatus || "",
  }

  const scopeSelectors = {
    project: (scope: ScopeOfWork): SortableValue => scope.project_name || "",
    client: (scope: ScopeOfWork): SortableValue => scope.client_name || "",
    scopeDate: (scope: ScopeOfWork): SortableValue => safeDate(scope.scope_date),
    status: (scope: ScopeOfWork): SortableValue => scope.project_status || "",
  }

  const sortedLiveCampaigns = applySort(liveCampaigns, liveCampaignSort, liveCampaignSelectors)
  const sortedLiveScopes = applySort(liveScopes, liveScopesSort, scopeSelectors)
  const sortedDueSoon = applySort(campaignsDueToStart, dueSoonSort, liveCampaignSelectors)
  const sortedFinished = applySort(campaignsFinishedRecently, finishedSort, liveCampaignSelectors)

  return (
    <div className="w-full h-full flex flex-col">
      <h1 className="text-4xl font-bold p-4">Assembled Media Overview</h1>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 w-full">
        {dashboardMetrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            className="w-full"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow w-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          {metric.title}
                        </CardTitle>
                        <div className={`p-2 rounded-full ${metric.color} text-white`}>
                          <metric.icon className="h-4 w-4" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metric.value}</div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{metric.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        ))}
      </div>

      {/* Tables Section */}
      <div className="grid gap-4 p-4 w-full">
        {/* Table of Live Campaigns */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Live Campaigns</span>
                <Badge className="bg-green-500">
                  {liveCampaigns.length} {liveCampaigns.length === 1 ? "Campaign" : "Campaigns"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                  <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                </div>
              ) : liveCampaigns.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No live campaigns</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHeader
                          label="Client Name"
                          direction={liveCampaignSort.column === "client" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("client", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <SortableTableHeader
                          label="Campaign Name"
                          direction={liveCampaignSort.column === "campaign" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("campaign", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <SortableTableHeader
                          label="MBA Number"
                          direction={liveCampaignSort.column === "mba" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("mba", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <SortableTableHeader
                          label="Start Date"
                          direction={liveCampaignSort.column === "startDate" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("startDate", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <SortableTableHeader
                          label="End Date"
                          direction={liveCampaignSort.column === "endDate" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("endDate", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <SortableTableHeader
                          label="Budget"
                          direction={liveCampaignSort.column === "budget" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("budget", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <SortableTableHeader
                          label="Version"
                          direction={liveCampaignSort.column === "version" ? liveCampaignSort.direction : null}
                          onToggle={() => toggleSort("version", liveCampaignSort, setLiveCampaignSort)}
                        />
                        <TableHead>Media Types</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLiveCampaigns.map(plan => (
                        <TableRow key={plan.id}>
                          <TableCell>{plan.mp_clientname}</TableCell>
                          <TableCell>{plan.mp_campaignname}</TableCell>
                          <TableCell>{plan.mp_mba_number}</TableCell>
                          <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                          <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                          <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                          <TableCell>{plan.mp_version}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {getMediaTypeTags(plan)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Table of Live Scopes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Live Scopes of Work</span>
                <Badge className="bg-green-500">
                  {liveScopes.length} {liveScopes.length === 1 ? "Scope" : "Scopes"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                </div>
              ) : liveScopes.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No live scopes of work</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHeader
                          label="Project Name"
                          direction={liveScopesSort.column === "project" ? liveScopesSort.direction : null}
                          onToggle={() => toggleSort("project", liveScopesSort, setLiveScopesSort)}
                        />
                        <SortableTableHeader
                          label="Client Name"
                          direction={liveScopesSort.column === "client" ? liveScopesSort.direction : null}
                          onToggle={() => toggleSort("client", liveScopesSort, setLiveScopesSort)}
                        />
                        <SortableTableHeader
                          label="Scope Date"
                          direction={liveScopesSort.column === "scopeDate" ? liveScopesSort.direction : null}
                          onToggle={() => toggleSort("scopeDate", liveScopesSort, setLiveScopesSort)}
                        />
                        <TableHead>Project Overview</TableHead>
                        <SortableTableHeader
                          label="Status"
                          direction={liveScopesSort.column === "status" ? liveScopesSort.direction : null}
                          onToggle={() => toggleSort("status", liveScopesSort, setLiveScopesSort)}
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLiveScopes.map(scope => (
                        <TableRow key={scope.id}>
                          <TableCell className="font-medium">{scope.project_name}</TableCell>
                          <TableCell>{scope.client_name}</TableCell>
                          <TableCell>{formatDate(scope.scope_date)}</TableCell>
                          <TableCell>
                            <div className="max-w-md truncate" title={scope.project_overview}>
                              {scope.project_overview || "N/A"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeColor(scope.project_status)}>
                              {scope.project_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Table of Campaigns Due to Start <7 Days */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Campaigns Due to Start &lt;7 Days</span>
                <Badge className="bg-blue-500">
                  {campaignsDueToStart.length} {campaignsDueToStart.length === 1 ? "Campaign" : "Campaigns"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                </div>
              ) : campaignsDueToStart.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No campaigns due to start in the next 7 days</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHeader
                          label="Client Name"
                          direction={dueSoonSort.column === "client" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("client", dueSoonSort, setDueSoonSort)}
                        />
                        <SortableTableHeader
                          label="Campaign Name"
                          direction={dueSoonSort.column === "campaign" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("campaign", dueSoonSort, setDueSoonSort)}
                        />
                        <SortableTableHeader
                          label="MBA Number"
                          direction={dueSoonSort.column === "mba" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("mba", dueSoonSort, setDueSoonSort)}
                        />
                        <SortableTableHeader
                          label="Start Date"
                          direction={dueSoonSort.column === "startDate" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("startDate", dueSoonSort, setDueSoonSort)}
                        />
                        <SortableTableHeader
                          label="End Date"
                          direction={dueSoonSort.column === "endDate" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("endDate", dueSoonSort, setDueSoonSort)}
                        />
                        <SortableTableHeader
                          label="Budget"
                          direction={dueSoonSort.column === "budget" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("budget", dueSoonSort, setDueSoonSort)}
                        />
                        <SortableTableHeader
                          label="Status"
                          direction={dueSoonSort.column === "status" ? dueSoonSort.direction : null}
                          onToggle={() => toggleSort("status", dueSoonSort, setDueSoonSort)}
                        />
                        <TableHead>Media Types</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDueSoon.map(plan => (
                        <TableRow key={plan.id}>
                          <TableCell>{plan.mp_clientname}</TableCell>
                          <TableCell>{plan.mp_campaignname}</TableCell>
                          <TableCell>{plan.mp_mba_number}</TableCell>
                          <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                          <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                          <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeColor(plan.mp_campaignstatus)}>
                              {plan.mp_campaignstatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {getMediaTypeTags(plan)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Table of Campaigns Finished in Previous 4 Weeks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Campaigns Finished in Previous 4 Weeks</span>
                <Badge className="bg-teal-500">
                  {campaignsFinishedRecently.length} {campaignsFinishedRecently.length === 1 ? "Campaign" : "Campaigns"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                </div>
              ) : campaignsFinishedRecently.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No campaigns finished in the previous 4 weeks</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHeader
                          label="Client Name"
                          direction={finishedSort.column === "client" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("client", finishedSort, setFinishedSort)}
                        />
                        <SortableTableHeader
                          label="Campaign Name"
                          direction={finishedSort.column === "campaign" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("campaign", finishedSort, setFinishedSort)}
                        />
                        <SortableTableHeader
                          label="MBA Number"
                          direction={finishedSort.column === "mba" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("mba", finishedSort, setFinishedSort)}
                        />
                        <SortableTableHeader
                          label="Start Date"
                          direction={finishedSort.column === "startDate" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("startDate", finishedSort, setFinishedSort)}
                        />
                        <SortableTableHeader
                          label="End Date"
                          direction={finishedSort.column === "endDate" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("endDate", finishedSort, setFinishedSort)}
                        />
                        <SortableTableHeader
                          label="Budget"
                          direction={finishedSort.column === "budget" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("budget", finishedSort, setFinishedSort)}
                        />
                        <SortableTableHeader
                          label="Status"
                          direction={finishedSort.column === "status" ? finishedSort.direction : null}
                          onToggle={() => toggleSort("status", finishedSort, setFinishedSort)}
                        />
                        <TableHead>Media Types</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedFinished.map(plan => (
                        <TableRow key={plan.id}>
                          <TableCell>{plan.mp_clientname}</TableCell>
                          <TableCell>{plan.mp_campaignname}</TableCell>
                          <TableCell>{plan.mp_mba_number}</TableCell>
                          <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                          <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                          <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeColor(plan.mp_campaignstatus)}>
                              {plan.mp_campaignstatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {getMediaTypeTags(plan)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pie Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 p-4 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="w-full"
        >
          <PieChart
            title="Spend via Publisher"
            description="Media cost only - Current financial year"
            data={publisherSpendData}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="w-full"
        >
          <PieChart
            title="Spend via Client"
            description="Media cost only - Current financial year"
            data={clientSpendData}
          />
        </motion.div>
      </div>
    </div>
  )
}
