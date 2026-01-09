"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, Edit } from "lucide-react"
import { AddClientForm } from "@/components/AddClientForm"
import { EditClientForm } from "@/components/EditClientForm"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { TableWithExport } from "@/components/ui/table-with-export"
import { SortableTableHeader, SortDirection, compareValues } from "@/components/ui/sortable-table-header"
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

type SortColumn =
  | "clientName"
  | "category"
  | "abn"
  | "mba"
  | "legalBusiness"
  | "keyContact"
  | "keyEmail"
  | "financeEmail"
  | "paymentDays"
  | "paymentTerms"

type SortableValue = string | number | Date | boolean | null | undefined

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
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: "clientName",
    direction: "asc",
  })

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

  const getClientName = (client: Client) => client.mp_client_name || client.clientname_input || ""

  const getSortValue = (client: Client, column: SortColumn): SortableValue => {
    switch (column) {
      case "clientName":
        return getClientName(client)
      case "category":
        return client.clientcategory
      case "abn":
        return client.abn
      case "mba":
        return client.mbaidentifier
      case "legalBusiness":
        return client.legalbusinessname
      case "keyContact":
        return `${client.keyfirstname} ${client.keylastname}`.trim()
      case "keyEmail":
        return client.keyemail
      case "financeEmail":
        return client.billingemail
      case "paymentDays":
        return client.payment_days
      case "paymentTerms":
        return client.payment_terms
      default:
        return ""
    }
  }

  const sortedClients = useMemo(() => {
    if (!Array.isArray(clients)) return []
    const direction = sort.direction ?? "asc"
    return [...clients].sort((a, b) =>
      compareValues(
        getSortValue(a, sort.column),
        getSortValue(b, sort.column),
        direction
      )
    )
  }, [clients, sort])

  const toggleSort = (column: SortColumn) => {
    setSort(prev =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    )
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
        data={sortedClients}
        filename="clients.csv"
        headers={csvHeaders}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHeader
                label="Client Name"
                direction={sort.column === "clientName" ? sort.direction : null}
                onToggle={() => toggleSort("clientName")}
              />
              <SortableTableHeader
                label="Category"
                direction={sort.column === "category" ? sort.direction : null}
                onToggle={() => toggleSort("category")}
              />
              <SortableTableHeader
                label="ABN"
                direction={sort.column === "abn" ? sort.direction : null}
                onToggle={() => toggleSort("abn")}
              />
              <SortableTableHeader
                label="MBA Identifier"
                direction={sort.column === "mba" ? sort.direction : null}
                onToggle={() => toggleSort("mba")}
              />
              <SortableTableHeader
                label="Legal Business Name"
                direction={sort.column === "legalBusiness" ? sort.direction : null}
                onToggle={() => toggleSort("legalBusiness")}
              />
              <SortableTableHeader
                label="Key Contact Name"
                direction={sort.column === "keyContact" ? sort.direction : null}
                onToggle={() => toggleSort("keyContact")}
              />
              <SortableTableHeader
                label="Key Contact Email"
                direction={sort.column === "keyEmail" ? sort.direction : null}
                onToggle={() => toggleSort("keyEmail")}
              />
              <SortableTableHeader
                label="Finance Email"
                direction={sort.column === "financeEmail" ? sort.direction : null}
                onToggle={() => toggleSort("financeEmail")}
              />
              <SortableTableHeader
                label="Payment Days"
                direction={sort.column === "paymentDays" ? sort.direction : null}
                onToggle={() => toggleSort("paymentDays")}
                align="right"
              />
              <SortableTableHeader
                label="Payment Terms"
                direction={sort.column === "paymentTerms" ? sort.direction : null}
                onToggle={() => toggleSort("paymentTerms")}
              />
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedClients.map((client) => (
                <TableRow key={client.id}>
                <TableCell>{getClientName(client) || '-'}</TableCell>
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
                <TableCell className="text-right">{client.payment_days}</TableCell>
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
              client={{ ...selectedClient, keyphone: String(selectedClient.keyphone ?? "") }}
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

