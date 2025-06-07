"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, Edit } from "lucide-react"
import { AddPublisherForm } from "@/components/AddPublisherForm"
import { EditPublisherForm } from "@/components/EditPublisherForm"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { TableWithExport } from "@/components/ui/table-with-export"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { motion } from "framer-motion"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Legend,
  Cell
} from "recharts"

interface Publisher {
  id: number
  publisher_name: string
  publisherid: string
  [key: string]: any
}

const mediaTypeColors: { [key: string]: string } = {
  television: "bg-blue-500",
  radio: "bg-green-500",
  newspaper: "bg-yellow-500",
  magazines: "bg-pink-500",
  ooh: "bg-purple-500",
  cinema: "bg-red-500",
  digidisplay: "bg-indigo-500",
  digiaudio: "bg-teal-500",
  digivideo: "bg-orange-500",
  bvod: "bg-cyan-500",
  integration: "bg-lime-500",
  search: "bg-amber-500",
  socialmedia: "bg-fuchsia-500",
  progdisplay: "bg-emerald-500",
  progvideo: "bg-sky-500",
  progbvod: "bg-rose-500",
  progaudio: "bg-violet-500",
  progooh: "bg-slate-500",
  influencers: "bg-neutral-500",
}

// Custom tooltip for the charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border rounded-lg shadow-lg">
        <p className="font-semibold">{label}</p>
        <div className="mt-2 space-y-1">
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {entry.name}: ${entry.value.toLocaleString()}
            </p>
          ))}
          <p className="font-bold mt-2 pt-2 border-t">
            Total: ${payload.reduce((sum: number, entry: any) => sum + entry.value, 0).toLocaleString()}
          </p>
        </div>
      </div>
    )
  }
  return null
}

// Generate random data for the charts
const generateChartData = (publishers: Publisher[], isYearToDate: boolean = false) => {
  // Get an array of colors from the mediaTypeColors object
  const colorValues = Object.values(mediaTypeColors).map(color => {
    // Convert Tailwind color classes to hex colors
    if (color === "bg-blue-500") return "#3b82f6";
    if (color === "bg-green-500") return "#10b981";
    if (color === "bg-yellow-500") return "#eab308";
    if (color === "bg-pink-500") return "#ec4899";
    if (color === "bg-purple-500") return "#8b5cf6";
    if (color === "bg-red-500") return "#ef4444";
    if (color === "bg-indigo-500") return "#6366f1";
    if (color === "bg-teal-500") return "#14b8a6";
    if (color === "bg-orange-500") return "#f97316";
    if (color === "bg-cyan-500") return "#06b6d4";
    if (color === "bg-lime-500") return "#84cc16";
    if (color === "bg-amber-500") return "#f59e0b";
    if (color === "bg-fuchsia-500") return "#d946ef";
    if (color === "bg-emerald-500") return "#10b981";
    if (color === "bg-sky-500") return "#0ea5e9";
    if (color === "bg-rose-500") return "#f43f5e";
    if (color === "bg-violet-500") return "#8b5cf6";
    if (color === "bg-slate-500") return "#64748b";
    if (color === "bg-neutral-500") return "#737373";
    return "#3b82f6"; // Default blue color
  });
  
  // Generate random spend data for each publisher
  return publishers.map((publisher, index) => {
    // For year to date, use higher values
    const baseValue = isYearToDate ? 50000 : 5000
    const randomSpend = Math.floor(baseValue + Math.random() * baseValue * 2)
    
    // Cycle through the colors
    const colorIndex = index % colorValues.length;
    
    return {
      name: publisher.publisher_name,
      spend: randomSpend,
      color: colorValues[colorIndex]
    }
  }).sort((a, b) => b.spend - a.spend) // Sort by spend in descending order
}

export default function Publishers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [selectedPublisher, setSelectedPublisher] = useState<Publisher | null>(null)
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [yearlyData, setYearlyData] = useState<any[]>([])

  useEffect(() => {
    fetchPublishers()
  }, [])

  useEffect(() => {
    if (publishers.length > 0) {
      setMonthlyData(generateChartData(publishers, false))
      setYearlyData(generateChartData(publishers, true))
    }
  }, [publishers])

  async function fetchPublishers() {
    try {
      const response = await fetch("/api/publishers")
      if (!response.ok) {
        throw new Error("Failed to fetch publishers")
      }
      const data = await response.json()
      setPublishers(data)
    } catch (error) {
      console.error("Error fetching publishers:", error)
    }
  }

  function getMediaTypeTags(publisher: Publisher) {
    const mediaTypes = [
      "television",
      "radio",
      "newspaper",
      "magazines",
      "ooh",
      "cinema",
      "digidisplay",
      "digiaudio",
      "digivideo",
      "bvod",
      "integration",
      "search",
      "socialmedia",
      "progdisplay",
      "progvideo",
      "progbvod",
      "progaudio",
      "progooh",
      "influencers",
    ]

    return mediaTypes
      .filter((type) => publisher[`pub_${type}`])
      .map((type) => (
        <Badge key={type} className={`mr-1 mb-1 ${mediaTypeColors[type]} text-white`}>
          {type}
        </Badge>
      ))
  }

  // Prepare data for CSV export
  const csvData = publishers.map(publisher => {
    const mediaTypes = [
      "television", "radio", "newspaper", "magazines", "ooh", "cinema",
      "digidisplay", "digiaudio", "digivideo", "bvod", "integration",
      "search", "socialmedia", "progdisplay", "progvideo", "progbvod",
      "progaudio", "progooh", "influencers"
    ]
    
    const activeMediaTypes = mediaTypes
      .filter(type => publisher[`pub_${type}`])
      .join(", ")
    
    return {
      publisher_name: publisher.publisher_name,
      publisherid: publisher.publisherid,
      media_types: activeMediaTypes
    }
  })

  // Define headers for CSV export
  const csvHeaders = {
    publisher_name: "Publisher Name",
    publisherid: "Publisher ID",
    media_types: "Media Types"
  }

  return (
    <div className="w-full px-4 py-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Publishers</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Publisher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Publisher</DialogTitle>
            </DialogHeader>
            <AddPublisherForm
              onSuccess={() => {
                setIsAddDialogOpen(false)
                fetchPublishers()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <TableWithExport
        data={csvData}
        filename="publishers.csv"
        headers={csvHeaders}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Publisher Name</TableHead>
              <TableHead>Publisher ID</TableHead>
              <TableHead>Media Types</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {publishers.map((publisher) => (
              <TableRow key={publisher.id}>
                <TableCell>{publisher.publisher_name}</TableCell>
                <TableCell>{publisher.publisherid}</TableCell>
                <TableCell>{getMediaTypeTags(publisher)}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedPublisher(publisher)
                      setIsEditDialogOpen(true)
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWithExport>

      {/* Publisher Spend Charts */}
      <div className="grid grid-cols-1 gap-4 mt-6">
        {/* Publisher Spend Past 30 Days */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Publisher Spend Past 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={90} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                      {monthlyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Publisher Spend Year to Date */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full"
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Publisher Spend Year to Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={yearlyData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={90} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                      {yearlyData.map((entry, index) => (
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Publisher</DialogTitle>
          </DialogHeader>
          {selectedPublisher && (
            <EditPublisherForm
              publisher={selectedPublisher}
              onSuccess={() => {
                setIsEditDialogOpen(false)
                fetchPublishers()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

