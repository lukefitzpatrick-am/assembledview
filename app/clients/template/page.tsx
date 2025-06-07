"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, BarChart3, DollarSign, TrendingUp, ShoppingCart, Download } from "lucide-react"
import { AddClientForm } from "@/components/AddClientForm"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { motion } from "framer-motion"
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Legend,
  TooltipProps,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Define types for the chart data
type ChartDataPoint = {
  date: string;
  total: number;
  [key: string]: string | number; // For media type keys
}

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

export default function ClientTemplate() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  // Example data
  const dataCallouts = [
    {
      title: "Active Media Channels",
      value: "6",
      icon: BarChart3,
      tooltip: "Number of active media channels currently in use",
      color: "bg-blue-500",
    },
    {
      title: "Spend Past 30 Days",
      value: "$347,894",
      icon: DollarSign,
      tooltip: "Total spend across all channels in the last 30 days",
      color: "bg-green-500",
    },
    {
      title: "Spend Year to Date",
      value: "$5,176,662",
      icon: TrendingUp,
      tooltip: "Total spend across all channels for the current year",
      color: "bg-purple-500",
    },
    {
      title: "Sales Past 30 Days",
      value: "18,310",
      icon: ShoppingCart,
      tooltip: "Total number of sales in the last 30 days",
      color: "bg-amber-500",
    },
  ]

  // Generate data for the stacked area chart
  const generateChartData = () => {
    const mediaTypes = ["Search", "Social Media", "BVOD", "Television", "OOH", "Radio"]
    const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"]
    
    // Generate 30 days of data
    const data: ChartDataPoint[] = []
    const totalSpend = 347894
    
    // Calculate average daily spend
    const avgDailySpend = Math.floor(totalSpend / 30)
    
    // Create data points for each day
    for (let i = 0; i < 30; i++) {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      // Format date in Australian format (DD/MM)
      const day = date.getDate().toString().padStart(2, '0')
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const formattedDate = `${day}/${month}`
      
      // Generate a daily total that varies by +0% to +40% from the average
      // This ensures we only have positive values
      const variation = Math.random() * 0.4 // Random value between 0 and 0.4
      const dailyTotal = Math.floor(avgDailySpend * (1 + variation))
      
      const dayData: ChartDataPoint = {
        date: formattedDate,
        total: dailyTotal
      }
      
      // Distribute the daily total across media types
      const mediaTypeCount = mediaTypes.length
      
      // Assign random percentages to each media type (except the last one)
      const percentages: number[] = []
      let remainingPercentage = 100
      
      for (let j = 0; j < mediaTypeCount - 1; j++) {
        // Generate a random percentage between 5% and 30% of the remaining percentage
        const maxPercentage = Math.min(30, remainingPercentage - (mediaTypeCount - j - 1) * 5)
        const minPercentage = 5
        const percentage = Math.floor(Math.random() * (maxPercentage - minPercentage + 1) + minPercentage)
        
        percentages.push(percentage)
        remainingPercentage -= percentage
      }
      
      // The last media type gets the remaining percentage
      percentages.push(remainingPercentage)
      
      // Apply the percentages to the daily total
      mediaTypes.forEach((mediaType, index) => {
        const mediaSpend = Math.floor(dailyTotal * (percentages[index] / 100))
        dayData[mediaType] = mediaSpend
      })
      
      data.push(dayData)
    }
    
    // Adjust the last day to ensure the total is exactly $347,894
    const currentTotal = data.reduce((sum, day) => sum + day.total, 0)
    const difference = totalSpend - currentTotal
    
    if (difference !== 0) {
      const lastDay = data[data.length - 1]
      
      // If the difference is positive, add it to the last day's total
      if (difference > 0) {
        lastDay.total += difference
        
        // Redistribute the difference proportionally across media types
        const lastDayMediaTypes = mediaTypes.filter(type => lastDay[type] !== undefined)
        const lastDayMediaSpends = lastDayMediaTypes.map(type => lastDay[type] as number)
        const lastDayTotalMediaSpend = lastDayMediaSpends.reduce((sum, spend) => sum + spend, 0)
        
        if (lastDayTotalMediaSpend > 0) {
          lastDayMediaTypes.forEach((mediaType, index) => {
            const proportion = lastDayMediaSpends[index] / lastDayTotalMediaSpend
            const adjustment = Math.floor(difference * proportion)
            lastDay[mediaType] = (lastDay[mediaType] as number) + adjustment
          })
        } else {
          // If there's no media spend on the last day, distribute evenly
          const evenShare = Math.floor(difference / lastDayMediaTypes.length)
          lastDayMediaTypes.forEach(mediaType => {
            lastDay[mediaType] = evenShare
          })
        }
      } 
      // If the difference is negative, we need to reduce the last day's total
      else if (difference < 0) {
        // We need to ensure we don't go negative, so we'll cap the reduction
        const reduction = Math.min(Math.abs(difference), lastDay.total - 1000) // Ensure at least $1000 remains
        lastDay.total -= reduction
        
        // Redistribute the reduction proportionally across media types
        const lastDayMediaTypes = mediaTypes.filter(type => lastDay[type] !== undefined)
        const lastDayMediaSpends = lastDayMediaTypes.map(type => lastDay[type] as number)
        const lastDayTotalMediaSpend = lastDayMediaSpends.reduce((sum, spend) => sum + spend, 0)
        
        if (lastDayTotalMediaSpend > 0) {
          lastDayMediaTypes.forEach((mediaType, index) => {
            const proportion = lastDayMediaSpends[index] / lastDayTotalMediaSpend
            const adjustment = Math.floor(reduction * proportion)
            // Ensure we don't go below a minimum value
            const currentValue = lastDay[mediaType] as number
            const newValue = Math.max(currentValue - adjustment, 100) // Ensure at least $100 per media type
            lastDay[mediaType] = newValue
          })
        }
      }
    }
    
    // Final check to ensure all values are positive
    data.forEach(day => {
      // Ensure total is positive
      day.total = Math.max(day.total, 1000)
      
      // Ensure all media type values are positive
      mediaTypes.forEach(mediaType => {
        if (day[mediaType] !== undefined) {
          day[mediaType] = Math.max(day[mediaType] as number, 100)
        }
      })
    })
    
    return { data, mediaTypes, colors }
  }

  const { data, mediaTypes, colors } = generateChartData()

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border rounded-lg shadow-lg">
          <p className="font-semibold">{label}</p>
          <div className="mt-2 space-y-1">
            {payload.map((entry, index) => (
              <p key={`item-${index}`} style={{ color: entry.color }}>
                {entry.name}: ${entry.value.toLocaleString()}
              </p>
            ))}
            <p className="font-bold mt-2 pt-2 border-t">
              Total: ${payload.reduce((sum, entry) => sum + entry.value, 0).toLocaleString()}
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  // Generate campaign data for the table
  const generateCampaignData = () => {
    const campaigns = []
    const channelOptions = ["Search", "Social Media", "BVOD", "Television", "OOH", "Radio"]
    const mbaNumbers = ["MBA-2023-001", "MBA-2023-002", "MBA-2023-003", "MBA-2023-004", "MBA-2023-005", "MBA-2023-006", "MBA-2023-007"]
    
    // Use fixed dates to avoid hydration errors
    const baseDate = new Date('2023-01-01')
    
    // Generate 7 campaigns over the past 12 months
    for (let i = 0; i < 7; i++) {
      // Generate fixed start date within the last 12 months
      const startDate = new Date(baseDate)
      startDate.setMonth(baseDate.getMonth() + i)
      
      // End date is 1-3 months after start date
      const endDate = new Date(startDate)
      endDate.setMonth(startDate.getMonth() + 2) // Fixed 2 months duration
      
      // Format dates in Australian format (DD/MM/YYYY)
      const formatDate = (date: Date) => {
        const day = date.getDate().toString().padStart(2, '0')
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
      }
      
      // Generate fixed budget between $50,000 and $500,000
      const budget = 50000 + (i * 65000) // Deterministic budget based on index
      
      // Generate fixed channels
      const numChannels = (i % 4) + 1 // Deterministic number of channels based on index
      const channels = []
      const availableChannels = [...channelOptions]
      
      for (let j = 0; j < numChannels; j++) {
        const channelIndex = (i + j) % availableChannels.length
        channels.push(availableChannels[channelIndex])
      }
      
      campaigns.push({
        name: `Campaign ${i + 1}`,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        budget: budget.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }),
        channels: channels.join(", "),
        mbaNumber: mbaNumbers[i]
      })
    }
    
    return campaigns
  }

  const campaignData = generateCampaignData()

  // Generate data for the media channel split pie chart
  const generateMediaChannelData = () => {
    const mediaTypes = ["Search", "Social Media", "BVOD", "Television", "OOH", "Radio"]
    const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"]
    
    // Use fixed percentages to avoid hydration errors
    const percentages = [15, 20, 10, 25, 15, 15]
    
    // Create data points for the pie chart
    const data = mediaTypes.map((mediaType, index) => ({
      name: mediaType,
      value: percentages[index],
      color: colors[index]
    }))
    
    return { data, colors }
  }

  // Generate data for the publisher spend bar chart
  const generatePublisherData = () => {
    const publishers = ["Google", "Meta", "OOH", "QMS", "Nine", "Nova", "SBS on Demand"]
    const colors = ["#4285F4", "#1877F2", "#FF9900", "#00A4E4", "#000000", "#E31837", "#E31837"]
    
    // Use fixed spend values to avoid hydration errors
    const spendValues = [450000, 380000, 120000, 95000, 280000, 150000, 75000]
    
    // Create data points for the bar chart
    const data = publishers.map((publisher, index) => ({
      name: publisher,
      spend: spendValues[index],
      color: colors[index]
    }))
    
    return { data, colors }
  }

  const { data: mediaChannelData, colors: mediaChannelColors } = generateMediaChannelData()
  const { data: publisherData, colors: publisherColors } = generatePublisherData()

  // Custom tooltip for the pie chart
  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border rounded-lg shadow-lg">
          <p className="font-semibold">{payload[0].name}</p>
          <p className="text-lg font-bold">
            {payload[0].value}%
          </p>
        </div>
      )
    }
    return null
  }

  // Custom tooltip for the bar chart
  const BarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border rounded-lg shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-lg font-bold">
            ${payload[0].value.toLocaleString()}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center p-4 w-full">
        <h1 className="text-3xl font-bold">Client Template</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <AddClientForm onSuccess={() => setIsAddDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 w-full">
        {dataCallouts.map((callout, index) => (
          <motion.div
            key={callout.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
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
                  data={data}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis 
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend />
                  {mediaTypes.map((mediaType, index) => (
                    <Area
                      key={mediaType}
                      type="monotone"
                      dataKey={mediaType}
                      stackId="1"
                      stroke={colors[index]}
                      fill={colors[index]}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Campaign Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="w-full p-4"
      >
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign Name</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>MBA Number</TableHead>
                    <TableHead>Media Plan</TableHead>
                    <TableHead>Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignData.map((campaign, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>{campaign.startDate}</TableCell>
                      <TableCell>{campaign.endDate}</TableCell>
                      <TableCell>{campaign.budget}</TableCell>
                      <TableCell>{campaign.channels}</TableCell>
                      <TableCell>{campaign.mbaNumber}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Media Channel Split and Publisher Spend Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 w-full">
        {/* Media Channel Split Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle>12-Month Media Channel Split</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mediaChannelData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {mediaChannelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<PieTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Publisher Spend Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Publisher Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={publisherData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis 
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip content={<BarTooltip />} />
                    <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                      {publisherData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 p-4 w-full">
        <div className="rounded-lg border p-4 w-full">
          <h2 className="text-xl font-semibold mb-4">Template Information</h2>
          <p className="text-gray-600">
            This is the client template page. Use this page to create new clients or manage client templates.
          </p>
        </div>
      </div>
    </div>
  )
} 