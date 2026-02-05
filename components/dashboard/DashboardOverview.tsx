"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BarChart3, TrendingUp, ShoppingCart, Users, Search } from "lucide-react"
import { format } from "date-fns"
import { PieChart } from "@/components/charts/PieChart"
import { StackedColumnChart } from "@/components/charts/StackedColumnChart"
import { useRouter } from "next/navigation"
import { AuthPageLoading } from "@/components/AuthLoadingState"
import axios from "axios"
import { mediaTypeTheme } from "@/lib/utils"
import { compareValues, SortableTableHeader, SortDirection } from "@/components/ui/sortable-table-header"
import { useAuthContext } from "@/contexts/AuthContext"

// Types reused from the original dashboard page
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
  deliverySchedule?: any
}

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

interface DashboardOverviewProps {
  /** Path used for login redirect when unauthenticated */
  returnTo?: string
  /** Optional title override */
  title?: string
  /** Hide the top metric cards */
  showMetrics?: boolean
  /** Hide the campaign/scope tables */
  showTables?: boolean
}

type SortableValue = string | number | Date | boolean | null | undefined

type SortState = {
  column: string
  direction: SortDirection
}

const LIVE_STATUSES = ["booked", "approved", "completed"]

const normalizeStatus = (status?: string | null) => (status || "").toString().toLowerCase().trim()

const normalizeClientFilterValue = (value: string) =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")

const slugifyClientName = (name?: string | null) => {
  if (!name || typeof name !== "string") return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim()
}

const getTodayBounds = () => {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return { startOfToday, endOfToday }
}

const getLatestPlanVersions = (plans: MediaPlan[]): MediaPlan[] => {
  const latestVersionsMap = new Map<string, MediaPlan>()
  plans.forEach((plan) => {
    const existing = latestVersionsMap.get(plan.mp_mba_number)
    if (!existing || plan.mp_version > existing.mp_version) {
      latestVersionsMap.set(plan.mp_mba_number, plan)
    }
  })
  return Array.from(latestVersionsMap.values())
}

// Helper function to get the current Australian Financial Year dates
const getCurrentFinancialYear = () => {
  const today = new Date()
  const currentMonth = today.getMonth() // 0-11 (Jan-Dec)
  const currentYear = today.getFullYear()

  const startYear = currentMonth >= 6 ? currentYear : currentYear - 1
  const startDate = new Date(startYear, 6, 1) // July 1st
  const endDate = new Date(startYear + 1, 5, 30) // June 30th

  return { startDate, endDate }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount)

const formatDate = (dateString: string) => format(new Date(dateString), "MMM d, yyyy")

const parseBillingScheduleAmount = (amountStr: string | number): number => {
  if (typeof amountStr === "number") return amountStr
  if (!amountStr || typeof amountStr !== "string") return 0
  const cleaned = amountStr.replace(/[$,]/g, "").trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

const parseMonthYear = (monthYear: string): Date | null => {
  try {
    const parts = monthYear.trim().split(" ")
    if (parts.length !== 2) return null

    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
    const monthAbbr = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

    const monthStr = parts[0].toLowerCase()
    const year = parseInt(parts[1])

    let monthIndex = monthNames.indexOf(monthStr)
    if (monthIndex === -1) {
      monthIndex = monthAbbr.indexOf(monthStr)
    }

    if (monthIndex === -1 || isNaN(year)) return null

    return new Date(year, monthIndex, 1)
  } catch {
    return null
  }
}

const extractPublishersFromSchedule = (schedule: any): Set<string> => {
  const publishers = new Set<string>()
  if (!schedule) return publishers

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return publishers
  }

  scheduleArray.forEach((entry: any) => {
    if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
      entry.mediaTypes.forEach((mediaType: any) => {
        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          mediaType.lineItems.forEach((lineItem: any) => {
            if (lineItem.header1 && lineItem.header1.trim() !== "") {
              publishers.add(lineItem.header1.trim())
            }
          })
        }
      })
    }
  })

  return publishers
}

const extractSpendFromSchedule = (schedule: any, fyStartDate: Date, fyEndDate: Date): { publisherSpend: Record<string, number>; totalSpend: number } => {
  const publisherSpend: Record<string, number> = {}
  let totalSpend = 0
  if (!schedule) return { publisherSpend, totalSpend }

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return { publisherSpend, totalSpend }
  }

  scheduleArray.forEach((entry: any) => {
    const monthDate = parseMonthYear(entry.monthYear)
    if (!monthDate) return

    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

    if (monthStart <= fyEndDate && monthEnd >= fyStartDate) {
      if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
        entry.mediaTypes.forEach((mediaType: any) => {
          if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
            mediaType.lineItems.forEach((lineItem: any) => {
              const amount = parseBillingScheduleAmount(lineItem.amount)
              if (amount > 0 && lineItem.header1 && lineItem.header1.trim() !== "") {
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

const transformMediaPlanData = (apiData: any[]): MediaPlan[] =>
  apiData.map((item: any) => {
    let billingSchedule = item.billingSchedule
    let deliverySchedule = item.deliverySchedule
    if (billingSchedule && typeof billingSchedule === "string") {
      try {
        billingSchedule = JSON.parse(billingSchedule)
      } catch {
        billingSchedule = null
      }
    }
    if (deliverySchedule && typeof deliverySchedule === "string") {
      try {
        deliverySchedule = JSON.parse(deliverySchedule)
      } catch {
        deliverySchedule = null
      }
    }

    return {
      id: item.id || 0,
      mp_clientname: item.mp_client_name || item.mp_clientname || "",
      mp_campaignname: item.campaign_name || item.mp_campaignname || "",
      mp_mba_number: item.mba_number || item.mp_mba_number || "",
      mp_version: item.version_number || item.mp_version || 1,
      mp_brand: item.brand || "",
      mp_campaignstatus: item.campaign_status || item.mp_campaignstatus || "",
      mp_campaigndates_start: item.campaign_start_date || item.mp_campaigndates_start || "",
      mp_campaigndates_end: item.campaign_end_date || item.mp_campaigndates_end || "",
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
      deliverySchedule: deliverySchedule || undefined,
    }
  })

export default function DashboardOverview({
  returnTo = "/dashboard",
  title = "Assembled Media Overview",
  showMetrics = true,
  showTables = true,
}: DashboardOverviewProps) {
  const { user, isLoading, error: authError, userRole, userClient, isClient } = useAuthContext()
  const router = useRouter()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [scopes, setScopes] = useState<ScopeOfWork[]>([])
  const [monthlyPublisherSpend, setMonthlyPublisherSpend] = useState<Array<{ month: string; data: Array<{ publisher: string; amount: number }> }>>([])
  const [monthlyClientSpend, setMonthlyClientSpend] = useState<Array<{ month: string; data: Array<{ client: string; amount: number }> }>>([])
  const [clientColors, setClientColors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [publisherSpendData, setPublisherSpendData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [clientSpendData, setClientSpendData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [liveCampaignSort, setLiveCampaignSort] = useState<SortState>({ column: "", direction: null })
  const [liveScopesSort, setLiveScopesSort] = useState<SortState>({ column: "", direction: null })
  const [dueSoonSort, setDueSoonSort] = useState<SortState>({ column: "", direction: null })
  const [finishedSort, setFinishedSort] = useState<SortState>({ column: "", direction: null })
  const [campaignSearch, setCampaignSearch] = useState("")
  const [campaignClientFilters, setCampaignClientFilters] = useState<string[]>([])
  const [savedViewLoaded, setSavedViewLoaded] = useState(false)
  const [savedViewExists, setSavedViewExists] = useState(false)
  const [savedViewJustSaved, setSavedViewJustSaved] = useState(false)

  const getNextDirection = (current: SortDirection) => (current === "asc" ? "desc" : current === "desc" ? null : "asc")

  const toggleSort = (column: string, sort: SortState, setSort: React.Dispatch<React.SetStateAction<SortState>>) => {
    setSort((prev) => {
      const direction = prev.column === column ? getNextDirection(prev.direction) : "asc"
      return { column, direction }
    })
  }

  const applySort = <T,>(data: T[], sortState: SortState, selectors: Record<string, (item: T) => SortableValue>): T[] => {
    const { column, direction } = sortState
    if (!direction || !selectors[column]) return data
    const select = selectors[column]
    return [...data].sort((a, b) => compareValues(select(a), select(b), direction as Exclude<SortDirection, null>))
  }

  const [dashboardMetrics, setDashboardMetrics] = useState([
    { title: "Total Live Campaigns", value: "0", icon: BarChart3, tooltip: "Campaigns booked/approved/completed running today", color: "bg-blue-500" },
    { title: "Total Live Scopes of Work", value: "0", icon: TrendingUp, tooltip: "Sum of scopes with status Approved or In-Progress", color: "bg-green-500" },
    { title: "Total Live Clients", value: "0", icon: Users, tooltip: "Sum of unique clients with live activity from campaigns and scopes", color: "bg-purple-500" },
    { title: "Total Live Publishers", value: "0", icon: ShoppingCart, tooltip: "Sum of unique publishers with live activity from campaigns", color: "bg-amber-500" },
  ])

  useEffect(() => {
    setMounted(true)
  }, [])

  const viewStorageKey = (() => {
    if (!user) return null
    const anyUser = user as any
    const id = (anyUser?.sub || anyUser?.email || anyUser?.name || "").toString().trim()
    if (!id) return null
    return `dashboard:view:v1:${id}:clientFilters`
  })()

  useEffect(() => {
    if (!mounted) return
    if (!user) return
    if (!viewStorageKey) return
    if (savedViewLoaded) return

    try {
      const raw = window.localStorage.getItem(viewStorageKey)
      if (!raw) {
        setSavedViewExists(false)
        setSavedViewLoaded(true)
        return
      }

      const parsed = JSON.parse(raw)
      const values = Array.isArray(parsed) ? parsed.map((v) => (typeof v === "string" ? v : "")).filter(Boolean) : []
      if (values.length > 0) {
        setCampaignClientFilters(values)
      }
      setSavedViewExists(true)
    } catch {
      // Ignore invalid JSON / storage errors.
      setSavedViewExists(false)
    } finally {
      setSavedViewLoaded(true)
    }
  }, [mounted, savedViewLoaded, user, viewStorageKey])

  const handleSaveView = () => {
    if (!viewStorageKey) return
    try {
      window.localStorage.setItem(viewStorageKey, JSON.stringify(campaignClientFilters))
      setSavedViewExists(true)
      setSavedViewJustSaved(true)
      window.setTimeout(() => setSavedViewJustSaved(false), 1500)
    } catch {
      // If storage fails (quota/private mode), just no-op.
    }
  }

  const handleClearSavedView = () => {
    if (!viewStorageKey) return
    try {
      window.localStorage.removeItem(viewStorageKey)
    } catch {
      // no-op
    } finally {
      setSavedViewExists(false)
      setSavedViewJustSaved(false)
    }
  }

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      const loginReturn = encodeURIComponent(returnTo || "/dashboard")
      router.push(`/auth/login?returnTo=${loginReturn}`)
    }
  }, [mounted, isLoading, user, router, returnTo])

  useEffect(() => {
    if (mounted && !isLoading && user && isClient) {
      if (userClient) {
        router.replace(`/dashboard/${userClient}`)
      } else {
        router.replace("/unauthorized")
      }
    }
  }, [mounted, isLoading, user, isClient, userClient, router])

  const fetchData = async () => {
    try {
      setLoading(true)
      setFetchError(null)

      try {
        const [monthlyPubResp, monthlyClientResp] = await Promise.all([
          fetch("/api/dashboard/global-monthly-publisher-spend"),
          fetch("/api/dashboard/global-monthly-client-spend"),
        ])

        const monthlyPub = monthlyPubResp.ok ? await monthlyPubResp.json() : []
        const monthlyClient = monthlyClientResp.ok ? await monthlyClientResp.json() : null

        setMonthlyPublisherSpend(Array.isArray(monthlyPub) ? monthlyPub : [])
        setMonthlyClientSpend(monthlyClient?.data || [])
        setClientColors(monthlyClient?.clientColors || {})
      } catch (error) {
        console.error("Dashboard: Error fetching monthly breakdowns:", error)
        setMonthlyPublisherSpend([])
        setMonthlyClientSpend([])
        setClientColors({})
      }

      const mediaPlansResponse = await fetch("/api/media_plans").catch((err) => {
        console.error("Dashboard: Error fetching media plans:", err)
        throw new Error("Failed to fetch media plans")
      })

      if (!mediaPlansResponse.ok) {
        const errorText = await mediaPlansResponse.text()
        console.error("Dashboard: Media plans API error:", mediaPlansResponse.status, errorText)
        throw new Error(`Failed to fetch media plans: ${mediaPlansResponse.status}`)
      }

      const mediaPlansRaw = await mediaPlansResponse.json()
      const mediaPlansData = transformMediaPlanData(Array.isArray(mediaPlansRaw) ? mediaPlansRaw : [])

      let scopesData: ScopeOfWork[] = []
      if (showTables || showMetrics) {
        const scopesResponse = await fetch("/api/scopes-of-work").catch((err) => {
          console.error("Dashboard: Error fetching scopes:", err)
          return { ok: false, json: async () => [] }
        })

        if (scopesResponse.ok) {
          const scopesRaw = await scopesResponse.json()
          scopesData = Array.isArray(scopesRaw) ? scopesRaw : []
        }
      }

      setMediaPlans(mediaPlansData)
      setScopes(scopesData)

      const latestPlans = getLatestPlanVersions(mediaPlansData)

      const statusFilteredPlans = latestPlans.filter((plan) => {
        const status = normalizeStatus(plan.mp_campaignstatus)
        return status !== "" && LIVE_STATUSES.includes(status)
      })

      const { startOfToday, endOfToday } = getTodayBounds()
      const liveCampaigns = statusFilteredPlans.filter((plan) => {
        const startDate = new Date(plan.mp_campaigndates_start)
        const endDate = new Date(plan.mp_campaigndates_end)
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false
        return startDate <= endOfToday && endDate >= startOfToday
      })

      const liveScopes = scopesData.filter((scope) => scope.project_status === "Approved" || scope.project_status === "In-Progress")

      const liveClients = new Set<string>()
      liveCampaigns.forEach((campaign) => {
        if (campaign.mp_clientname) liveClients.add(campaign.mp_clientname)
      })
      liveScopes.forEach((scope) => {
        if (scope.client_name) liveClients.add(scope.client_name)
      })

      const totalLiveCampaigns = liveCampaigns.length
      const totalLiveScopes = liveScopes.length
      const totalLiveClients = liveClients.size

      const { startDate: fyStartDate, endDate: fyEndDate } = getCurrentFinancialYear()
      const eligibleCampaignsInFY = statusFilteredPlans.filter((plan) => {
        const planStartDate = new Date(plan.mp_campaigndates_start)
        const planEndDate = new Date(plan.mp_campaigndates_end)
        return planStartDate <= fyEndDate && planEndDate >= fyStartDate
      })

      const allPublishersSet = new Set<string>()
      for (const campaign of liveCampaigns) {
        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
        if (schedule) {
          const publishers = extractPublishersFromSchedule(schedule)
          publishers.forEach((publisher) => allPublishersSet.add(publisher))
        }
      }
      const totalLivePublishers = allPublishersSet.size

      const publisherSpend: Record<string, number> = {}
      const clientSpend: Record<string, number> = {}

      for (const campaign of eligibleCampaignsInFY) {
        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
        if (schedule) {
          try {
            const { publisherSpend: campaignPublisherSpend, totalSpend: campaignTotalSpend } = extractSpendFromSchedule(schedule, fyStartDate, fyEndDate)

            Object.entries(campaignPublisherSpend).forEach(([publisher, amount]) => {
              publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
            })

            if (campaign.mp_clientname && campaignTotalSpend > 0) {
              clientSpend[campaign.mp_clientname] = (clientSpend[campaign.mp_clientname] || 0) + campaignTotalSpend
            }
          } catch (error) {
            console.error(`Error processing billing schedule for campaign ${campaign.mp_mba_number}:`, error)
          }
        }
      }

      const publisherSpendArray = Object.entries(publisherSpend)
        .map(([name, value]) => ({ name, value: Math.round(value), percentage: 0 }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)

      const totalPublisherSpend = publisherSpendArray.reduce((sum, item) => sum + item.value, 0)
      publisherSpendArray.forEach((item) => {
        item.percentage = totalPublisherSpend > 0 ? (item.value / totalPublisherSpend) * 100 : 0
      })

      const clientSpendArray = Object.entries(clientSpend)
        .map(([name, value]) => ({ name, value: Math.round(value), percentage: 0 }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)

      const totalClientSpend = clientSpendArray.reduce((sum, item) => sum + item.value, 0)
      clientSpendArray.forEach((item) => {
        item.percentage = totalClientSpend > 0 ? (item.value / totalClientSpend) * 100 : 0
      })

      setPublisherSpendData(publisherSpendArray)
      setClientSpendData(clientSpendArray)

      setDashboardMetrics([
        { title: "Total Live Campaigns", value: totalLiveCampaigns.toString(), icon: BarChart3, tooltip: "Campaigns booked/approved/completed running today", color: "bg-blue-500" },
        { title: "Total Live Scopes of Work", value: totalLiveScopes.toString(), icon: TrendingUp, tooltip: "Sum of scopes with status Approved or In-Progress", color: "bg-green-500" },
        { title: "Total Live Clients", value: totalLiveClients.toString(), icon: Users, tooltip: "Unique clients with live campaigns or scopes", color: "bg-purple-500" },
        { title: "Total Live Publishers", value: totalLivePublishers.toString(), icon: ShoppingCart, tooltip: "Unique publishers appearing on live campaigns", color: "bg-amber-500" },
      ])
    } catch (error) {
      console.error("Dashboard: Error fetching data:", error)
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading dashboard data"
      setFetchError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mounted && user && !isClient) {
      fetchData()
    }
    if (mounted && user && isClient) {
      setLoading(false)
    }
  }, [mounted, user, isClient, showMetrics, showTables])

  if (!mounted || isLoading) {
    return <AuthPageLoading message="Loading dashboard..." />
  }

  if (user && isClient) {
    return <AuthPageLoading message="Redirecting to your dashboard..." />
  }

  if (authError) {
    const errorMessage = authError instanceof Error ? authError.message : "Authentication error"
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">Error loading dashboard: {errorMessage}</p>
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
    return null
  }

  const getLiveCampaigns = () => {
    const latestPlans = getLatestPlanVersions(mediaPlans)
    const { startOfToday, endOfToday } = getTodayBounds()

    return latestPlans.filter((plan) => {
      const status = normalizeStatus(plan.mp_campaignstatus)
      if (!LIVE_STATUSES.includes(status)) return false

      const startDate = new Date(plan.mp_campaigndates_start)
      const endDate = new Date(plan.mp_campaigndates_end)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false

      return startDate <= endOfToday && endDate >= startOfToday
    })
  }

  const getLiveScopes = () => scopes.filter((scope) => scope.project_status === "Approved" || scope.project_status === "In-Progress")

  const getCampaignsDueToStart = () => {
    const { startOfToday, endOfToday } = getTodayBounds()
    const tenDaysAhead = new Date(endOfToday)
    tenDaysAhead.setDate(endOfToday.getDate() + 10)

    const latestPlans = getLatestPlanVersions(mediaPlans)

    return latestPlans.filter((plan) => {
      const startDate = new Date(plan.mp_campaigndates_start)
      if (isNaN(startDate.getTime())) return false

      return startDate >= startOfToday && startDate <= tenDaysAhead
    })
  }

  const getCampaignsFinishedRecently = () => {
    const { endOfToday } = getTodayBounds()
    const fortyDaysAgo = new Date(endOfToday)
    fortyDaysAgo.setDate(endOfToday.getDate() - 40)

    const latestPlans = getLatestPlanVersions(mediaPlans)

    return latestPlans.filter((plan) => {
      const status = normalizeStatus(plan.mp_campaignstatus)
      if (!LIVE_STATUSES.includes(status)) return false

      const endDate = new Date(plan.mp_campaigndates_end)
      if (isNaN(endDate.getTime())) return false

      return endDate >= fortyDaysAgo && endDate <= endOfToday
    })
  }

  const normalizeSearch = (value: string) => value.toLowerCase().trim()

  const applyCampaignFilters = (plans: MediaPlan[]) => {
    const searchLower = normalizeSearch(campaignSearch)
    const selectedClients = new Set(
      campaignClientFilters.map((value) => normalizeClientFilterValue(value)).filter(Boolean)
    )

    if (!searchLower && selectedClients.size === 0) return plans

    return plans.filter((plan) => {
      const clientKey = normalizeClientFilterValue(plan.mp_clientname || "")
      if (selectedClients.size > 0 && !selectedClients.has(clientKey)) return false

      if (!searchLower) return true

      const haystack = [
        plan.mp_clientname,
        plan.mp_campaignname,
        plan.mp_mba_number,
        plan.mp_brand,
        plan.mp_campaignstatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(searchLower)
    })
  }

  const safeDate = (value: string) => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date(0) : d
  }

  const getStatusBadgeColor = (status: string) => {
    if (!status) return "bg-gray-500"
    switch (status.toLowerCase()) {
      case "booked":
        return "bg-purple-500"
      case "approved":
        return "bg-green-500"
      case "planned":
        return "bg-blue-500"
      case "draft":
        return "bg-gray-500"
      case "completed":
        return "bg-teal-500"
      case "cancelled":
        return "bg-red-500"
      case "in-progress":
        return "bg-purple-500"
      default:
        return "bg-gray-500"
    }
  }

  const getMediaTypeTags = (plan: MediaPlan) => {
    const isEnabled = (value: any): boolean => {
      if (typeof value === "boolean") return value === true
      if (typeof value === "string") return value.toLowerCase() === "true" || value === "1"
      if (typeof value === "number") return value === 1
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
      return (
        <Badge key={key} className="mr-1 mb-1 text-white" style={{ backgroundColor: color || "#666666" }}>
          {key}
        </Badge>
      )
    })
  }

  const latestPlansForFilters = getLatestPlanVersions(mediaPlans)
  const clientFilterOptions = (() => {
    const map = new Map<string, string>()

    for (const plan of latestPlansForFilters) {
      const label = (plan.mp_clientname || "").toString().trim()
      if (!label) continue
      const key = normalizeClientFilterValue(label)
      if (!key) continue
      if (!map.has(key)) map.set(key, label)
    }

    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({
        value,
        label,
        keywords: `${label} ${value}`,
      })) as const
  })()

  const liveCampaigns = showTables ? applyCampaignFilters(getLiveCampaigns()) : []
  const liveScopes = showTables ? getLiveScopes() : []
  const campaignsDueToStart = showTables ? applyCampaignFilters(getCampaignsDueToStart()) : []
  const campaignsFinishedRecently = showTables ? applyCampaignFilters(getCampaignsFinishedRecently()) : []

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

  const shouldScrollLiveCampaigns = sortedLiveCampaigns.length > 12
  const shouldScrollLiveScopes = sortedLiveScopes.length > 12
  const shouldScrollDueSoon = sortedDueSoon.length > 12
  const shouldScrollFinished = sortedFinished.length > 12

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-4xl font-bold">{title}</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="pl-10"
            />
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-[520px] sm:grid-cols-[1fr_auto]">
            <MultiSelectCombobox
              options={clientFilterOptions}
              values={campaignClientFilters}
              onValuesChange={setCampaignClientFilters}
              placeholder="All clients"
              allSelectedText="All clients"
              selectAllText="Select all"
              clearAllText="Clear all"
              searchPlaceholder="Filter clients..."
              emptyText="No clients found."
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="whitespace-nowrap"
                onClick={handleSaveView}
                disabled={!viewStorageKey}
                title={!viewStorageKey ? "Sign in to save a view" : undefined}
              >
                {savedViewJustSaved ? "Saved" : "Save as view"}
              </Button>
              {savedViewExists ? (
                <Button
                  type="button"
                  variant="outline"
                  className="whitespace-nowrap"
                  onClick={handleClearSavedView}
                  disabled={!viewStorageKey}
                >
                  Clear saved
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      {showMetrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 w-full">
          {dashboardMetrics.map((metric, index) => (
            <motion.div key={metric.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.05 }} className="w-full">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card className="overflow-hidden hover:shadow-lg transition-shadow w-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
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
      )}

      {/* Tables Section */}
      {showTables && (
        <div className="grid gap-4 p-4 w-full">
          {/* Table of Live Campaigns */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="w-full">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Live Campaigns (Booked / Approved / Completed)</span>
                  <Badge className="bg-green-500">{liveCampaigns.length} {liveCampaigns.length === 1 ? "Campaign" : "Campaigns"}</Badge>
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
                  <div className={`overflow-x-auto ${shouldScrollLiveCampaigns ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Client Name" direction={liveCampaignSort.column === "client" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("client", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Campaign Name" direction={liveCampaignSort.column === "campaign" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("campaign", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="MBA Number" direction={liveCampaignSort.column === "mba" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("mba", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Start Date" direction={liveCampaignSort.column === "startDate" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("startDate", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="End Date" direction={liveCampaignSort.column === "endDate" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("endDate", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Budget" direction={liveCampaignSort.column === "budget" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("budget", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Version" direction={liveCampaignSort.column === "version" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("version", liveCampaignSort, setLiveCampaignSort)} />
                          <TableHead>Media Types</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLiveCampaigns.map((plan) => (
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
                            <TableCell>
                              <div className="flex flex-col items-start gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={!slugifyClientName(plan.mp_clientname)}
                                  onClick={() => {
                                    const slug = slugifyClientName(plan.mp_clientname)
                                    if (!slug) return
                                    router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                                  }}
                                >
                                  View
                                </Button>
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="w-full">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Live Scopes of Work</span>
                  <Badge className="bg-green-500">{liveScopes.length} {liveScopes.length === 1 ? "Scope" : "Scopes"}</Badge>
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
                  <div className={`overflow-x-auto ${shouldScrollLiveScopes ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Project Name" direction={liveScopesSort.column === "project" ? liveScopesSort.direction : null} onToggle={() => toggleSort("project", liveScopesSort, setLiveScopesSort)} />
                          <SortableTableHeader label="Client Name" direction={liveScopesSort.column === "client" ? liveScopesSort.direction : null} onToggle={() => toggleSort("client", liveScopesSort, setLiveScopesSort)} />
                          <SortableTableHeader label="Scope Date" direction={liveScopesSort.column === "scopeDate" ? liveScopesSort.direction : null} onToggle={() => toggleSort("scopeDate", liveScopesSort, setLiveScopesSort)} />
                          <TableHead>Project Overview</TableHead>
                          <SortableTableHeader label="Status" direction={liveScopesSort.column === "status" ? liveScopesSort.direction : null} onToggle={() => toggleSort("status", liveScopesSort, setLiveScopesSort)} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLiveScopes.map((scope) => (
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
                              <Badge className={getStatusBadgeColor(scope.project_status)}>{scope.project_status}</Badge>
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

          {/* Table of Campaigns Starting Soon */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="w-full">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Campaigns Starting Soon (Next 10 Days)</span>
                  <Badge className="bg-blue-500">{campaignsDueToStart.length} {campaignsDueToStart.length === 1 ? "Campaign" : "Campaigns"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                  </div>
                ) : campaignsDueToStart.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No campaigns starting in the next 10 days</p>
                ) : (
                  <div className={`overflow-x-auto ${shouldScrollDueSoon ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Client Name" direction={dueSoonSort.column === "client" ? dueSoonSort.direction : null} onToggle={() => toggleSort("client", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Campaign Name" direction={dueSoonSort.column === "campaign" ? dueSoonSort.direction : null} onToggle={() => toggleSort("campaign", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="MBA Number" direction={dueSoonSort.column === "mba" ? dueSoonSort.direction : null} onToggle={() => toggleSort("mba", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Start Date" direction={dueSoonSort.column === "startDate" ? dueSoonSort.direction : null} onToggle={() => toggleSort("startDate", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="End Date" direction={dueSoonSort.column === "endDate" ? dueSoonSort.direction : null} onToggle={() => toggleSort("endDate", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Budget" direction={dueSoonSort.column === "budget" ? dueSoonSort.direction : null} onToggle={() => toggleSort("budget", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Status" direction={dueSoonSort.column === "status" ? dueSoonSort.direction : null} onToggle={() => toggleSort("status", dueSoonSort, setDueSoonSort)} />
                          <TableHead>Media Types</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedDueSoon.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell>{plan.mp_clientname}</TableCell>
                            <TableCell>{plan.mp_campaignname}</TableCell>
                            <TableCell>{plan.mp_mba_number}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                            <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                            <TableCell>
                              <Badge className={getStatusBadgeColor(plan.mp_campaignstatus)}>{plan.mp_campaignstatus}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {getMediaTypeTags(plan)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={!slugifyClientName(plan.mp_clientname)}
                                  onClick={() => {
                                    const slug = slugifyClientName(plan.mp_clientname)
                                    if (!slug) return
                                    router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                                  }}
                                >
                                  View
                                </Button>
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

          {/* Table of Campaigns Finished in Past 40 Days */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="w-full">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Campaigns Finished in Past 40 Days</span>
                  <Badge className="bg-teal-500">{campaignsFinishedRecently.length} {campaignsFinishedRecently.length === 1 ? "Campaign" : "Campaigns"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                  </div>
                ) : campaignsFinishedRecently.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No campaigns finished in the past 40 days</p>
                ) : (
                  <div className={`overflow-x-auto ${shouldScrollFinished ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Client Name" direction={finishedSort.column === "client" ? finishedSort.direction : null} onToggle={() => toggleSort("client", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Campaign Name" direction={finishedSort.column === "campaign" ? finishedSort.direction : null} onToggle={() => toggleSort("campaign", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="MBA Number" direction={finishedSort.column === "mba" ? finishedSort.direction : null} onToggle={() => toggleSort("mba", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Start Date" direction={finishedSort.column === "startDate" ? finishedSort.direction : null} onToggle={() => toggleSort("startDate", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="End Date" direction={finishedSort.column === "endDate" ? finishedSort.direction : null} onToggle={() => toggleSort("endDate", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Budget" direction={finishedSort.column === "budget" ? finishedSort.direction : null} onToggle={() => toggleSort("budget", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Status" direction={finishedSort.column === "status" ? finishedSort.direction : null} onToggle={() => toggleSort("status", finishedSort, setFinishedSort)} />
                          <TableHead>Media Types</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedFinished.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell>{plan.mp_clientname}</TableCell>
                            <TableCell>{plan.mp_campaignname}</TableCell>
                            <TableCell>{plan.mp_mba_number}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                            <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                            <TableCell>
                              <Badge className={getStatusBadgeColor(plan.mp_campaignstatus)}>{plan.mp_campaignstatus}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {getMediaTypeTags(plan)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={!slugifyClientName(plan.mp_clientname)}
                                  onClick={() => {
                                    const slug = slugifyClientName(plan.mp_clientname)
                                    if (!slug) return
                                    router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                                  }}
                                >
                                  View
                                </Button>
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
      )}

      {/* Pie Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 p-4 w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }} className="w-full">
          <PieChart title="Spend via Publisher" description="Media cost only - Current financial year" data={publisherSpendData} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.5 }} className="w-full">
          <PieChart title="Spend via Client" description="Media cost only - Current financial year" data={clientSpendData} />
        </motion.div>
      </div>

      {/* Monthly Stacked Charts */}
      <div className="flex flex-col gap-4 p-4 w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.6 }} className="w-full">
          <StackedColumnChart
            title="Monthly Spend by Client"
            description="Media cost by client per month (current FY, billing schedule)"
            data={monthlyClientSpend.map((m) => ({
              month: m.month,
              ...m.data.reduce((acc, item) => {
                acc[item.client] = Math.round(item.amount)
                return acc
              }, {} as Record<string, number>),
            }))}
            colors={(() => {
              const keys = Array.from(new Set(monthlyClientSpend.flatMap((m) => m.data.map((d) => d.client))))
              const palette = keys.map((k) => clientColors[k] || undefined).filter(Boolean) as string[]
              return palette.length > 0 ? palette : undefined
            })()}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.7 }} className="w-full">
          <StackedColumnChart
            title="Monthly Spend by Publisher"
            description="Media cost by publisher per month (current FY, billing schedule)"
            data={monthlyPublisherSpend.map((m) => ({
              month: m.month,
              ...m.data.reduce((acc, item) => {
                acc[item.publisher] = Math.round(item.amount)
                return acc
              }, {} as Record<string, number>),
            }))}
          />
        </motion.div>
      </div>
    </div>
  )
}

