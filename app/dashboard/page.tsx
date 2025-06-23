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

// Define the type for a MediaPlan object
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

// --- HELPER FUNCTIONS ---

// Helper function to get the current Australian Financial Year dates
const getCurrentFinancialYear = () => {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11 (Jan-Dec)
  const currentYear = today.getFullYear();

  let startYear;
  if (currentMonth >= 6) { // July is month 6
    startYear = currentYear;
  } else {
    startYear = currentYear - 1;
  }

  const startDate = new Date(startYear, 6, 1); // July 1st
  const endDate = new Date(startYear + 1, 5, 30); // June 30th

  return { startDate, endDate };
};

// **FIXED**: Helper function to format currency to AUD
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
};

// Helper function to format dates
const formatDate = (dateString: string) => {
  return format(new Date(dateString), "MMM d, yyyy");
};

export default function DashboardPage() {
  const [chartData, setChartData] = useState<{data: ChartDataPoint[], mediaTypes: string[], colors: string[]} | null>(null);
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // State for the dashboard overview metrics
  const [dashboardMetrics, setDashboardMetrics] = useState([
    {
      title: "Total MediaPlans",
      value: "0",
      icon: BarChart3,
      tooltip: "Unique plans in the current financial year",
      color: "bg-blue-500",
    },
    {
      title: "Active Clients",
      value: "0",
      icon: TrendingUp,
      tooltip: "Unique clients with active plans in the current financial year",
      color: "bg-green-500",
    },
    {
      title: "Total Publishers",
      value: "N/A", // Placeholder
      icon: ShoppingCart,
      tooltip: "Unique publishers associated with plans in the financial year",
      color: "bg-purple-500",
    },
    {
      title: "Total Spend",
      value: "$0.00",
      icon: DollarSign,
      tooltip: "Total spend for plans in the current financial year",
      color: "bg-amber-500",
    },
  ]);

  // **FIXED**: Correctly structured useEffect hook for data fetching
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/mediaplans");
        if (!response.ok) {
          throw new Error("Failed to fetch media plans");
        }
        const data: MediaPlan[] = await response.json();
        setMediaPlans(data);

        // 1. Get financial year dates
        const { startDate: fyStartDate, endDate: fyEndDate } = getCurrentFinancialYear();

        // 2. Filter plans active in the financial year
        const plansInFY = data.filter(plan => {
          const planStartDate = new Date(plan.mp_campaigndates_start);
          const planEndDate = new Date(plan.mp_campaigndates_end);
          return planStartDate <= fyEndDate && planEndDate >= fyStartDate;
        });

        // 3. Calculate metrics
        const totalMediaPlans = plansInFY.length;
        const activeClients = new Set(plansInFY.map(p => p.mp_clientname)).size;
        const totalSpend = plansInFY.reduce((sum, plan) => sum + plan.mp_campaignbudget, 0);

        // 4. Update the dashboard metrics state
        setDashboardMetrics([
          { title: "Total MediaPlans", value: totalMediaPlans.toString(), icon: BarChart3, tooltip: "Unique plans in the current financial year", color: "bg-blue-500" },
          { title: "Active Clients", value: activeClients.toString(), icon: TrendingUp, tooltip: "Unique clients with active plans in the current financial year", color: "bg-green-500" },
          { title: "Total Publishers", value: "N/A", icon: ShoppingCart, tooltip: "Unique publishers associated with plans in the financial year", color: "bg-purple-500" },
          { title: "Total Spend", value: formatCurrency(totalSpend), icon: DollarSign, tooltip: "Total spend for plans in the current financial year", color: "bg-amber-500" },
        ]);

        // (Your existing chart logic - can be updated to use real data later)
        const dates = Array.from({ length: 30 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            return format(date, "MMM dd");
        });
        const mediaTypes = ["TV", "Radio", "Newspaper", "Magazines", "OOH", "Cinema", "Digital Display", "Digital Audio", "Digital Video"];
        const colors = ["#4CAF50", "#2196F3", "#9C27B0", "#F44336", "#FF9800", "#795548", "#607D8B", "#E91E63", "#00BCD4"];
        const generatedChartData = dates.map(date => {
            const dataPoint: ChartDataPoint = { date };
            mediaTypes.forEach(type => {
                dataPoint[type] = Math.floor(Math.random() * 10000);
            });
            return dataPoint;
        });
        setChartData({ data: generatedChartData, mediaTypes, colors });

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Helper functions used for rendering
  const getMediaTypeBadges = (plan: MediaPlan) => {
    const badges: string[] = [];
    if (plan.mp_television) badges.push("TV");
    // ... (add other media types as in your original file)
    if (plan.mp_influencers) badges.push("Influencers");
    return badges;
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "booked": return "bg-purple-500";
      // ... (add other statuses as in your original file)
      default: return "bg-gray-500";
    }
  };

  const getMediaPlansByStatus = (status: string) => {
    return mediaPlans.filter(plan => plan.mp_campaignstatus.toLowerCase() === status.toLowerCase());
  };
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 rounded shadow-lg border">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // **FIXED**: A single root element is returned, containing all JSX
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
                    <AreaChart data={chartData.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend />
                      {chartData.mediaTypes.map((mediaType, index) => (
                        <Area key={mediaType} type="monotone" dataKey={mediaType} stackId="1" stroke={chartData.colors[index]} fill={chartData.colors[index]} />
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
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Budget</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getMediaPlansByStatus("Booked").map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.mp_clientname}</TableCell>
                        <TableCell>{plan.mp_campaignname}</TableCell>
                        <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                        <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
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