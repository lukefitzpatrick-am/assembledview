"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Input } from "@/components/ui/input"
import { SortableTableHeader, type SortDirection } from "@/components/ui/sortable-table-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useListGridLayoutPreference } from "@/lib/hooks/useListGridLayoutPreference"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import type { ClientHubSummary } from "@/lib/types/dashboard"
import { ClientHubAddClientButton } from "./ClientHubAddClientButton"
import { ClientHubCard } from "./ClientHubCard"
import { Button } from "@/components/ui/button"
import { Edit, Search, Users } from "lucide-react"

type ClientSortKey = "clientName" | "liveCampaigns" | "totalSpend"

export function ClientHubPageClient({ summaries }: { summaries: ClientHubSummary[] }) {
  const { mode, setMode } = useListGridLayoutPreference()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<ClientSortKey>("clientName")
  const [sortDir, setSortDir] = useState<Exclude<SortDirection, null>>("asc")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return summaries
    return summaries.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q)
    )
  }, [summaries, search])

  const rows = useMemo(() => {
    const out = [...filtered]
    const mult = sortDir === "asc" ? 1 : -1
    out.sort((a, b) => {
      let cmp = 0
      if (sortKey === "clientName") {
        cmp = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
      } else if (sortKey === "liveCampaigns") {
        cmp = a.liveCampaigns - b.liveCampaigns
      } else {
        cmp = a.totalSpend - b.totalSpend
      }
      if (cmp !== 0) return mult * cmp
      return a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
    })
    return out
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: ClientSortKey) => {
    setSortKey((current) => {
      if (current !== key) {
        setSortDir(key === "clientName" ? "asc" : "desc")
        return key
      }
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      return current
    })
  }

  const showSearchQuery = Boolean(search.trim())

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6">
      <MediaPlanEditorHero
        className="mb-2"
        title="Client hub"
        Icon={Users}
        detail={
          <p>Browse clients in alphabetical order; search and column headers refine the list.</p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ListGridToggle value={mode} onChange={setMode} />
            <div className="relative w-full min-w-[12rem] max-w-xs sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search clients by name or slug"
              />
            </div>
            <ClientHubAddClientButton />
          </div>
        }
      />

      {summaries.length === 0 ? (
        <Panel className="rounded-3xl border-muted/70 shadow-sm">
          <PanelHeader>
            <PanelTitle>No clients</PanelTitle>
            <PanelDescription>Could not load clients or the list is empty.</PanelDescription>
          </PanelHeader>
        </Panel>
      ) : mode === "list" ? (
        <Panel className="overflow-hidden rounded-3xl border-muted/70 shadow-sm">
          <PanelHeader className="border-b border-muted/40 pb-3">
            <div className="space-y-1">
              <PanelTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Clients
              </PanelTitle>
              <PanelDescription className="text-xs">
                {rows.length.toLocaleString("en-AU")} of {summaries.length.toLocaleString("en-AU")} clients
                {showSearchQuery ? " (search)" : ""}.
              </PanelDescription>
            </div>
          </PanelHeader>
          <PanelContent standalone className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHeader
                      label="Client"
                      direction={sortKey === "clientName" ? sortDir : null}
                      onToggle={() => toggleSort("clientName")}
                    />
                    <SortableTableHeader
                      label="Live campaigns"
                      direction={sortKey === "liveCampaigns" ? sortDir : null}
                      onToggle={() => toggleSort("liveCampaigns")}
                      align="right"
                    />
                    <SortableTableHeader
                      label="FY spend"
                      direction={sortKey === "totalSpend" ? sortDir : null}
                      onToggle={() => toggleSort("totalSpend")}
                      align="right"
                    />
                    <TableHead className="w-[140px] px-4 py-3 text-left font-medium text-muted-foreground">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        {showSearchQuery ? "No clients match your search." : "No rows to display."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={`${row.id}-${row.slug}`}>
                        <TableCell>
                          <div className="font-semibold">{row.clientName}</div>
                          <p className="text-xs text-muted-foreground">View dashboard &amp; details</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{row.liveCampaigns}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          ${row.totalSpend.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild className="whitespace-nowrap">
                            <Link href={`/client/${encodeURIComponent(row.slug)}`}>
                              <Edit className="mr-2 h-4 w-4" />
                              Open hub
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PanelContent>
        </Panel>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {showSearchQuery ? "No clients match your search." : "No rows to display."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <ClientHubCard key={`${row.id}-${row.slug}`} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}
