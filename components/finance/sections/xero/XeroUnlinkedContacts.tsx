"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Section } from "@/components/layout/Section"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusPill } from "@/components/ui/status-pill"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { getClientDisplayName } from "@/lib/clients/slug"
import type { Tone } from "@/lib/design/status"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money/cents"

type SuggestionVia = "alias" | "fuzzy" | "mba"

type UnlinkedSuggestion = {
  clientId: number
  clientName: string
  via: SuggestionVia
}

type UnlinkedContact = {
  xeroContactId: string
  contactName: string
  invoiceCount: number
  totalCents: number
  amountDueCents: number
  latestIssueDate: string
  suggestion: UnlinkedSuggestion | null
}

type Coverage = {
  linked: number
  total: number
  hiddenInvoiceCount: number
}

type ClientOption = {
  id: number
  name: string
}

const VIA_LABEL: Record<SuggestionVia, string> = {
  alias: "Alias",
  fuzzy: "Name match",
  mba: "MBA",
}

const VIA_TONE: Record<SuggestionVia, Tone> = {
  alias: "insight",
  fuzzy: "neutral",
  mba: "action",
}

function isVia(value: unknown): value is SuggestionVia {
  return value === "alias" || value === "fuzzy" || value === "mba"
}

function parseSuggestion(value: unknown): UnlinkedSuggestion | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { clientId?: unknown; clientName?: unknown; via?: unknown }
  const clientId = Number(raw.clientId)
  if (!Number.isInteger(clientId) || clientId <= 0 || !isVia(raw.via)) return null
  return {
    clientId,
    clientName: typeof raw.clientName === "string" ? raw.clientName : "",
    via: raw.via,
  }
}

function parseContact(value: unknown): UnlinkedContact | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const xeroContactId = typeof raw.xeroContactId === "string" ? raw.xeroContactId.trim() : ""
  if (!xeroContactId) return null
  return {
    xeroContactId,
    contactName: typeof raw.contactName === "string" ? raw.contactName : "",
    invoiceCount: Number(raw.invoiceCount) || 0,
    totalCents: Number(raw.totalCents) || 0,
    amountDueCents: Number(raw.amountDueCents) || 0,
    latestIssueDate: typeof raw.latestIssueDate === "string" ? raw.latestIssueDate : "",
    suggestion: parseSuggestion(raw.suggestion),
  }
}

function parseCoverage(value: unknown): Coverage | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { linked?: unknown; total?: unknown; hiddenInvoiceCount?: unknown }
  const linked = Number(raw.linked)
  const total = Number(raw.total)
  const hiddenInvoiceCount = Number(raw.hiddenInvoiceCount)
  if (![linked, total, hiddenInvoiceCount].every((n) => Number.isFinite(n))) return null
  return { linked, total, hiddenInvoiceCount }
}

function coverageLine(coverage: Coverage) {
  return (
    <>
      <span className="num">{coverage.linked}</span>
      {" of "}
      <span className="num">{coverage.total}</span>
      {" contacts linked. "}
      <span className="num">{coverage.hiddenInvoiceCount}</span>
      {" invoices hidden from clients."}
    </>
  )
}

export function XeroUnlinkedContacts() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<UnlinkedContact[]>([])
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [linksRes, clientsRes] = await Promise.all([
        fetch("/api/finance/xero/contact-links/unlinked"),
        fetch("/api/clients"),
      ])
      if (!linksRes.ok) {
        const body = (await linksRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `Could not load unlinked contacts (${linksRes.status})`)
      }
      const payload = (await linksRes.json()) as { contacts?: unknown; coverage?: unknown }
      setContacts(
        (Array.isArray(payload.contacts) ? payload.contacts : [])
          .map(parseContact)
          .filter((row): row is UnlinkedContact => row != null),
      )
      setCoverage(parseCoverage(payload.coverage))

      if (clientsRes.ok) {
        const raw = (await clientsRes.json()) as unknown
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { items?: unknown }).items)
            ? (raw as { items: unknown[] }).items
            : []
        setClients(
          list
            .map((item) => {
              const row = item as Record<string, unknown>
              const id = Number(row.id)
              if (!Number.isFinite(id) || id <= 0) return null
              return { id, name: getClientDisplayName(row) || `Client ${id}` }
            })
            .filter((item): item is ClientOption => item != null)
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load unlinked contacts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedClientId = useCallback(
    (row: UnlinkedContact) => choice[row.xeroContactId] ?? (row.suggestion ? String(row.suggestion.clientId) : ""),
    [choice],
  )

  const linkContact = useCallback(
    async (row: UnlinkedContact) => {
      const clientId = Number(selectedClientId(row))
      if (!Number.isInteger(clientId) || clientId <= 0 || busyRef.current) return
      busyRef.current = true
      setBusyId(row.xeroContactId)

      const previousContacts = contacts
      const previousCoverage = coverage
      setContacts((current) => current.filter((item) => item.xeroContactId !== row.xeroContactId))
      if (coverage) {
        setCoverage({
          linked: coverage.linked + 1,
          total: coverage.total,
          hiddenInvoiceCount: Math.max(0, coverage.hiddenInvoiceCount - row.invoiceCount),
        })
      }

      try {
        const res = await fetch("/api/finance/xero/contact-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xeroContactId: row.xeroContactId, clientId }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
          throw new Error(err.message || err.error || `Request failed (${res.status})`)
        }
        const body = (await res.json()) as { coverage?: unknown }
        const next = parseCoverage(body.coverage)
        if (next) setCoverage(next)
      } catch (e) {
        setContacts(previousContacts)
        setCoverage(previousCoverage)
        toast({
          variant: "destructive",
          title: "Could not link this contact",
          description: e instanceof Error ? e.message : "Unknown error",
        })
      } finally {
        busyRef.current = false
        setBusyId(null)
      }
    },
    [contacts, coverage, selectedClientId, toast],
  )

  const columns = useMemo<DataTableColumn<UnlinkedContact>[]>(
    () => [
      {
        id: "contact",
        header: "Contact",
        accessor: (row) => row.contactName || row.xeroContactId,
      },
      {
        id: "invoices",
        header: "Invoices",
        accessor: (row) => row.invoiceCount,
        align: "right",
      },
      {
        id: "outstanding",
        header: "Outstanding",
        accessor: (row) => row.amountDueCents,
        align: "right",
        cell: (row) => formatMoney(fromCents(row.amountDueCents)),
      },
      {
        id: "latest",
        header: "Latest",
        accessor: (row) => row.latestIssueDate,
        cell: (row) => formatDateShort(row.latestIssueDate),
      },
      {
        id: "suggestion",
        header: "Suggested client",
        accessor: (row) => row.suggestion?.clientName ?? "",
        cell: (row) =>
          row.suggestion ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{row.suggestion.clientName || `Client ${row.suggestion.clientId}`}</span>
              <StatusPill tone={VIA_TONE[row.suggestion.via]} label={VIA_LABEL[row.suggestion.via]} />
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      },
      {
        id: "link",
        header: "Link",
        accessor: (row) => selectedClientId(row),
        sortable: false,
        csv: false,
        cell: (row) => {
          const selected = selectedClientId(row)
          const options =
            row.suggestion && !clients.some((client) => client.id === row.suggestion?.clientId)
              ? [
                  ...clients,
                  {
                    id: row.suggestion.clientId,
                    name: row.suggestion.clientName || `Client ${row.suggestion.clientId}`,
                  },
                ]
              : clients
          return (
            <div className="flex min-w-[16rem] items-center gap-2">
              <Select
                value={selected || undefined}
                onValueChange={(value) =>
                  setChoice((current) => ({ ...current, [row.xeroContactId]: value }))
                }
              >
                <SelectTrigger className="h-8 min-w-0 flex-1" aria-label={`Client for ${row.contactName || "contact"}`}>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((client) => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={!selected || busyId != null}
                onClick={() => void linkContact(row)}
              >
                {busyId === row.xeroContactId ? "Linking" : "Link"}
              </Button>
            </div>
          )
        },
      },
    ],
    [busyId, clients, linkContact, selectedClientId],
  )

  if (loading && contacts.length === 0 && !coverage) {
    return <LoadingState rows={4} />
  }

  if (error && contacts.length === 0) {
    return (
      <ErrorState
        title="Could not load unlinked contacts"
        message={error}
        onRetry={() => void load()}
      />
    )
  }

  return (
    <Section title="Unlinked contacts" description={coverage ? coverageLine(coverage) : undefined}>
      <DataTable
        columns={columns}
        rows={contacts}
        getRowId={(row) => row.xeroContactId}
        initialSort={{ id: "outstanding", direction: "desc" }}
        caption="Unlinked Xero contacts"
        empty={
          <EmptyState
            title="All contacts are linked"
            message="Every FY26 contact already has a client link."
          />
        }
      />
    </Section>
  )
}
