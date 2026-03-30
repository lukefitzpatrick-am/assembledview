"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
    <div className="w-full max-w-none px-4 pb-12 pt-0 md:px-6">
      <div className="relative -mx-4 mb-6 border-b border-border/40 bg-gradient-to-br from-primary/5 via-background to-background px-4 pb-6 pt-8 md:-mx-6 md:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Finance — Retainers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monthly client retainer amounts and payment terms.</p>
      </div>

      <Card className="overflow-hidden border-border/40 shadow-sm">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
        <CardHeader>
          <CardTitle className="text-base font-semibold">Client Retainers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-muted" />
                <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
              </div>
              <span className="text-sm text-muted-foreground">Loading clients…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">No clients found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-b border-border/20 transition-colors hover:bg-muted/30">
                    <TableHead>Client Name</TableHead>
                    <TableHead>Monthly Retainer</TableHead>
                    <TableHead>Payment Days</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>MBA Identifier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                  {clients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="border-b border-border/20 transition-colors hover:bg-muted/30"
                    >
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


























