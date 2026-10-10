"use client"

import { useEffect, useMemo, useState } from "react"

import { getClientDisplayName } from "@/lib/clients/slug"

type ClientRow = {
  id?: number
  mp_client_name?: string
  client_name?: string
  clientname_input?: string
  name?: string
}

type PlanRow = {
  mba_number?: string
  mp_client_name?: string
  mp_campaignname?: string
  campaign_name?: string
  client_id?: number | null
}

const selectClass =
  "flex h-10 w-full rounded-input border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function InsightScopePickers({
  clientId,
  mbaNumber,
  onClientId,
  onMbaNumber,
}: {
  clientId: string
  mbaNumber: string
  onClientId: (id: string | null) => void
  onMbaNumber: (mba: string | null) => void
}) {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setClientsError(null)
      try {
        const [clientRes, planRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/mediaplans"),
        ])
        if (!clientRes.ok) throw new Error("Could not load clients")
        const clientData = (await clientRes.json()) as unknown
        const planData = planRes.ok ? ((await planRes.json()) as unknown) : []
        if (cancelled) return
        setClients(Array.isArray(clientData) ? (clientData as ClientRow[]) : [])
        setPlans(Array.isArray(planData) ? (planData as PlanRow[]) : [])
      } catch (err) {
        if (cancelled) return
        setClients([])
        setPlans([])
        setClientsError(err instanceof Error ? err.message : "Could not load clients")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const clientOptions = useMemo(() => {
    const options: { id: string; label: string }[] = []
    for (const row of clients) {
      if (typeof row.id !== "number" || !Number.isFinite(row.id) || row.id <= 0) continue
      const label = getClientDisplayName(row)
      if (!label) continue
      options.push({ id: String(row.id), label })
    }
    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [clients])

  const selectedClient = clientOptions.find((row) => row.id === clientId) ?? null

  const mbaOptions = useMemo(() => {
    if (!selectedClient) return []
    const id = Number(selectedClient.id)
    const name = selectedClient.label.trim().toLowerCase()
    const seen = new Set<string>()
    const options: { mba: string; label: string }[] = []
    for (const plan of plans) {
      const mba = String(plan.mba_number ?? "").trim().toLowerCase()
      if (!mba || seen.has(mba)) continue
      const byId = plan.client_id != null && Number(plan.client_id) === id
      const byName = String(plan.mp_client_name ?? "").trim().toLowerCase() === name
      if (!byId && !byName) continue
      seen.add(mba)
      const campaign = String(plan.mp_campaignname || plan.campaign_name || "").trim()
      options.push({ mba, label: campaign ? `${mba} — ${campaign}` : mba })
    }
    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [plans, selectedClient])

  return (
    <>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Client</span>
        <select
          className={selectClass}
          value={clientId}
          disabled={loading}
          aria-label="Client"
          onChange={(e) => onClientId(e.target.value.trim() || null)}
        >
          <option value="">{loading ? "Loading clients…" : "Select a client"}</option>
          {clientOptions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        {clientsError ? <span className="text-xs text-destructive">{clientsError}</span> : null}
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">MBA (optional)</span>
        <select
          className={selectClass}
          value={mbaNumber}
          disabled={!clientId}
          aria-label="MBA"
          onChange={(e) => onMbaNumber(e.target.value.trim().toLowerCase() || null)}
        >
          <option value="">{clientId ? "Any campaign" : "Pick a client first"}</option>
          {mbaOptions.map((row) => (
            <option key={row.mba} value={row.mba}>
              {row.label}
            </option>
          ))}
          {mbaNumber && !mbaOptions.some((row) => row.mba === mbaNumber) ? (
            <option value={mbaNumber}>{mbaNumber}</option>
          ) : null}
        </select>
      </label>
    </>
  )
}
