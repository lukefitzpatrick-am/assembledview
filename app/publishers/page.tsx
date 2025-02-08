"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, Edit } from "lucide-react"
import { AddPublisherForm } from "@/components/AddPublisherForm"
import { EditPublisherForm } from "@/components/EditPublisherForm"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

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

export default function Publishers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [selectedPublisher, setSelectedPublisher] = useState<Publisher | null>(null)

  useEffect(() => {
    fetchPublishers()
  }, [])

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

  return (
    <div className="space-y-4">
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

