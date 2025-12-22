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
import { useUser } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import { AuthPageLoading } from '@/components/AuthLoadingState'
import { hasRole } from '@/lib/rbac'

interface Client {
  id: number
  clientname_input?: string
  mp_client_name?: string
  clientcategory: string
  abn: string
  mbaidentifier: string
  legalbusinessname: string
  streetaddress: string
  suburb: string
  state_dropdown: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT"
  postcode: number
  payment_days: number
  payment_terms: string
  brand_colour: string
  keyfirstname: string
  keylastname: string
  keyphone: number
  keyemail: string
  billingemail: string
}

const DEFAULT_BRAND_COLOUR = "#49C7EB"

const getBrandColour = (colour?: string) => {
  if (!colour) return DEFAULT_BRAND_COLOUR
  return colour.startsWith("#") ? colour : `#${colour}`
}

export default function Clients() {
  const { user, isLoading, error } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push('/auth/login?returnTo=/dashboard');
    } else if (mounted && user && !hasRole(user, ['admin', 'manager'])) {
      // Temporarily allow access for debugging - remove this in production
      console.log('User does not have required roles, but allowing access for debugging');
      // router.push('/unauthorized');
    }
  }, [mounted, isLoading, user, router]);

  useEffect(() => {
    if (mounted && user) {
      // Temporarily fetch clients for all users for debugging
      fetchClients()
    }
  }, [mounted, user])

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
    mp_client_name: "Client Name",
    clientcategory: "Category",
    abn: "ABN",
    mbaidentifier: "MBA Identifier",
    legalbusinessname: "Legal Business Name",
    keyfirstname: "Key Contact First Name",
    keylastname: "Key Contact Last Name",
    keyemail: "Key Contact Email",
  billingemail: "Finance Email",
  payment_days: "Payment Days",
  payment_terms: "Payment Terms",
  brand_colour: "Brand Colour",
  }

  if (!mounted || isLoading) {
    return <AuthPageLoading message="Loading clients..." />;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-red-600">Error loading clients: {error.message}</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  // Temporarily allow access for debugging - remove this in production
  // if (!hasRole(user, ['admin', 'manager'])) {
  //   return null; // Will redirect to unauthorized
  // }

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
              <TableHead>Payment Days</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.isArray(clients) &&
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>{client.mp_client_name || client.clientname_input || '-'}</TableCell>
                  <TableCell>{client.clientcategory}</TableCell>
                  <TableCell>{client.abn}</TableCell>
                  <TableCell>
                    {client.mbaidentifier ? (
                      <Badge
                        className="text-white"
                        style={{
                          backgroundColor: getBrandColour(client.brand_colour),
                        }}
                      >
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
                  <TableCell>{client.payment_days}</TableCell>
                  <TableCell>{client.payment_terms}</TableCell>
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

