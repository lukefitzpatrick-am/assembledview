"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, Edit } from "lucide-react"
import { AddClientForm } from "@/components/AddClientForm"
import { EditClientForm } from "@/components/EditClientForm"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { TableWithExport } from "@/components/ui/table-with-export"

interface Client {
  id: number
  clientname_input: string
  clientcategory: string
  abn: string
  mbaidentifier: string
  legalbusinessname: string
  streetaddress: string
  suburb: string
  state_dropdown: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT"
  postcode: number
  keyfirstname: string
  keylastname: string
  keyphone: number
  keyemail: string
  billingemail: string
}

export default function Clients() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    try {
      const response = await fetch("/api/clients")
      if (!response.ok) {
        throw new Error("Failed to fetch clients")
      }
      const data = await response.json()
      if (Array.isArray(data)) {
        setClients(data)
      } else {
        console.error("Received invalid data format for clients")
        setClients([])
      }
    } catch (error) {
      console.error("Error fetching clients:", error)
      setClients([])
    }
  }

  // Define headers for CSV export
  const csvHeaders = {
    clientname_input: "Client Name",
    clientcategory: "Category",
    abn: "ABN",
    mbaidentifier: "MBA Identifier",
    legalbusinessname: "Legal Business Name",
    keyfirstname: "Key Contact First Name",
    keylastname: "Key Contact Last Name",
    keyemail: "Key Contact Email",
    billingemail: "Finance Email"
  }

  return (
    <div className="w-full px-4 py-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Clients</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <AddClientForm
              onSuccess={() => {
                setIsAddDialogOpen(false)
                fetchClients()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <TableWithExport
        data={clients}
        filename="clients.csv"
        headers={csvHeaders}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>ABN</TableHead>
              <TableHead>MBA Identifier</TableHead>
              <TableHead>Legal Business Name</TableHead>
              <TableHead>Key Contact Name</TableHead>
              <TableHead>Key Contact Email</TableHead>
              <TableHead>Finance Email</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.isArray(clients) &&
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>{client.clientname_input}</TableCell>
                  <TableCell>{client.clientcategory}</TableCell>
                  <TableCell>{client.abn}</TableCell>
                  <TableCell>
                    {client.mbaidentifier ? (
                      <Badge className="bg-blue-500 text-white">
                        {client.mbaidentifier}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{client.legalbusinessname}</TableCell>
                  <TableCell>{`${client.keyfirstname} ${client.keylastname}`}</TableCell>
                  <TableCell>{client.keyemail}</TableCell>
                  <TableCell>{client.billingemail}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedClient(client)
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <EditClientForm
              client={selectedClient}
              onSuccess={() => {
                setIsEditDialogOpen(false)
                fetchClients()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

