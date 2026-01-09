"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2 } from "lucide-react"

type Client = {
  id: number
  mp_client_name?: string
  clientname_input?: string
  monthlyretainer?: number
  payment_days?: number
  payment_terms?: string
  mbaidentifier?: string
}

export default function FinanceRetainersPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadClients = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/clients")
        if (!res.ok) {
          throw new Error("Failed to fetch clients")
        }
        const data = await res.json()
        setClients(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clients")
      } finally {
        setLoading(false)
      }
    }
    loadClients()
  }, [])

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null || isNaN(amount)) return "N/A"
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount)
  }

  const safeText = (val?: string) => (val && val.trim() ? val : "N/A")

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Finance - Retainers</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Retainers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-6">{error}</div>
          ) : clients.length === 0 ? (
            <div className="text-center text-gray-500 py-6">No clients found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Monthly Retainer</TableHead>
                    <TableHead>Payment Days</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>MBA Identifier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>{client.mp_client_name || client.clientname_input || "Unknown"}</TableCell>
                      <TableCell>{formatCurrency(client.monthlyretainer)}</TableCell>
                      <TableCell>{client.payment_days ?? 30}</TableCell>
                      <TableCell>{safeText(client.payment_terms) || "Net 30 days"}</TableCell>
                      <TableCell>{safeText(client.mbaidentifier)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


























