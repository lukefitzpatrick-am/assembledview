"use client"

import Link from "next/link"
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useListGridLayoutPreference } from "@/lib/hooks/useListGridLayoutPreference"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import type { ClientHubSummary } from "@/lib/types/dashboard"
import { ClientHubAddClientButton } from "./ClientHubAddClientButton"
import { ClientHubCard } from "./ClientHubCard"
import { Button } from "@/components/ui/button"
import { Edit, Users } from "lucide-react"

export function ClientHubPageClient({ summaries }: { summaries: ClientHubSummary[] }) {
  const { mode, setMode } = useListGridLayoutPreference()

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6">
      <MediaPlanEditorHero
        className="mb-2"
        title="Client hub"
        Icon={Users}
        detail={
          <p>Clients in alphabetical order with live campaigns and financial year spend.</p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ListGridToggle value={mode} onChange={setMode} />
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
              <PanelContent standalone className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Live campaigns</TableHead>
                        <TableHead className="text-right">FY spend</TableHead>
                        <TableHead className="w-[140px]">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaries.map((row) => (
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PanelContent>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {summaries.map((row) => (
                <ClientHubCard key={`${row.id}-${row.slug}`} row={row} />
              ))}
            </div>
          )}
    </div>
  )
}
