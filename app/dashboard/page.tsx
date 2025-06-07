"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BarChart3, TrendingUp, ShoppingCart, DollarSign } from "lucide-react"
import { format } from "date-fns"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts"

// Define types for the chart data
type ChartDataPoint = {
  date: string
  [key: string]: string | number
}

type MediaPlan = {
  id: number
  mp_clientname: string
  mp_campaignname: string
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
}

export default function DashboardPage() {
  const [pageLoaded, setPageLoaded] = useState(false)
  const [chartData, setChartData] = useState<{data: ChartDataPoint[], mediaTypes: string[], colors: string[]} | null>(null)
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [loading, setLoading] = useState(true)
  
  // Example data callouts similar to the template page
  const dataCallouts = [
    {
      title: "Total MediaPlans",
      value: "123",
      icon: BarChart3,
      tooltip: "Active and draft plans",
      color: "bg-blue-500",
    },
    {
      title: "Active Clients",
      value: "45",
      icon: TrendingUp,
      tooltip: "Clients with ongoing campaigns",
      color: "bg-green-500",
    },
    {
      title: "Total Publishers",
      value: "67",
      icon: ShoppingCart,
      tooltip: "Registered publishers",
      color: "bg-purple-500",
    },
    {
      title: "Total Spend",
      value: "$1,234,567",
      icon: DollarSign,
      tooltip: "Across all active campaigns",
      color: "bg-amber-500",
    },
  ]

  // Initialize data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch media plans
        const response = await fetch("/api/mediaplans")
        if (!response.ok) {
          throw new Error("Failed to fetch media plans")
        }
        const data = await response.json()
        setMediaPlans(data)
        setLoading(false)

        // Generate chart data
        const dates = Array.from({ length: 30 }, (_, i) => {
          const date = new Date()
          date.setDate(date.getDate() - (29 - i))
          return format(date, "MMM dd")
        })

        const mediaTypes = ["TV", "Radio", "Newspaper", "Magazines", "OOH", "Cinema", "Digital Display", "Digital Audio", "Digital Video"]
        const colors = [
          "#4CAF50", "#2196F3", "#9C27B0", "#F44336", "#FF9800", 
          "#795548", "#607D8B", "#E91E63", "#00BCD4"
        ]

        const chartData = dates.map(date => {
          const dataPoint: ChartDataPoint = { date }
          mediaTypes.forEach(type => {
            dataPoint[type] = Math.floor(Math.random() * 10000)
          })
          return dataPoint
        })

        setChartData({
          data: chartData,
          mediaTypes,
          colors
        })

      } catch (error) {
        console.error("Error fetching data:", error)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 rounded shadow-lg border">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: ${entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  // Helper function to format dates
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM d, yyyy")
  }

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  // Helper function to get media type badges
  const getMediaTypeBadges = (plan: MediaPlan) => {
    const badges: string[] = []
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
    if (plan.mp_progdisplay) badges.push("Prog Display")
    if (plan.mp_progvideo) badges.push("Prog Video")
    if (plan.mp_progbvod) badges.push("Prog BVOD")
    if (plan.mp_progaudio) badges.push("Prog Audio")
    if (plan.mp_progooh) badges.push("Prog OOH")
    if (plan.mp_influencers) badges.push("Influencers")
    return badges
  }

  // Helper function to get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "draft":
        return "bg-gray-500"
      case "planned":
        return "bg-blue-500"
      case "approved":
        return "bg-green-500"
      case "booked":
        return "bg-purple-500"
      case "completed":
        return "bg-amber-500"
      case "cancelled":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  // Helper function to filter media plans by status
  const getMediaPlansByStatus = (status: string) => {
    return mediaPlans.filter(plan => plan.mp_campaignstatus.toLowerCase() === status.toLowerCase())
  }

  return (
    <div className="w-full h-full flex flex-col">
      <h1 className="text-4xl font-bold p-4">Assembled Media Overview</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 w-full">
        {dataCallouts.map((callout, index) => (
          <motion.div
            key={callout.title}
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
                          {callout.title}
                        </CardTitle>
                        <div className={`p-2 rounded-full ${callout.color} text-white`}>
                          <callout.icon className="h-4 w-4" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{callout.value}</div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{callout.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        ))}
      </div>

      {/* Media Spend Chart */}
      <AnimatePresence>
        {chartData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full p-4"
          >
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Media Spend Past 30 Days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[500px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData.data}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis 
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend />
                      {chartData.mediaTypes.map((mediaType, index) => (
                        <Area
                          key={mediaType}
                          type="monotone"
                          dataKey={mediaType}
                          stackId="1"
                          stroke={chartData.colors[index]}
                          fill={chartData.colors[index]}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Plans Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full p-4"
      >
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Booked Media Plans</span>
              <Badge className={getStatusBadgeColor("Booked")}>
                {getMediaPlansByStatus("Booked").length} {getMediaPlansByStatus("Booked").length === 1 ? "Plan" : "Plans"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
                <div className="h-10 w-full bg-gray-200 animate-pulse rounded"></div>
              </div>
            ) : getMediaPlansByStatus("Booked").length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No booked media plans</p>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getMediaPlansByStatus("Booked").map((plan) => (
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
  )
} 