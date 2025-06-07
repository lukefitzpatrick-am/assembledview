"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Edit } from "lucide-react"
import { EditClientForm } from "@/components/EditClientForm"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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

export default function ClientPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<Client | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchClient()
  }, [params.id])

  async function fetchClient() {
    try {
      setLoading(true)
      const response = await fetch(`/api/clients/${params.id}`)
      if (!response.ok) {
        throw new Error("Failed to fetch client")
      }
      const data = await response.json()
      setClient(data)
    } catch (error) {
      console.error("Error fetching client:", error)
      setError("Failed to load client information")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (error || !client) {
    return <div>Error: {error || "Client not found"}</div>
  }

  return (
    <div className="w-full px-4 py-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{client?.clientname_input || "Client Details"}</h1>
        <Button onClick={() => setIsEditDialogOpen(true)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit Client
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="font-medium">Category</dt>
                <dd>{client.clientcategory}</dd>
              </div>
              <div>
                <dt className="font-medium">ABN</dt>
                <dd>{client.abn}</dd>
              </div>
              <div>
                <dt className="font-medium">MBA Identifier</dt>
                <dd>{client.mbaidentifier}</dd>
              </div>
              <div>
                <dt className="font-medium">Legal Business Name</dt>
                <dd>{client.legalbusinessname}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="font-medium">Address</dt>
                <dd>
                  {client.streetaddress}
                  <br />
                  {client.suburb}, {client.state_dropdown} {client.postcode}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Key Contact</dt>
                <dd>
                  {client.keyfirstname} {client.keylastname}
                  <br />
                  {client.keyemail}
                  <br />
                  {client.keyphone}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Billing Email</dt>
                <dd>{client.billingemail}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <EditClientForm
            client={client}
            onSuccess={() => {
              setIsEditDialogOpen(false)
              fetchClient()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
} 