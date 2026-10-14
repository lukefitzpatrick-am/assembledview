"use client"

import { StatusPill } from "@/components/ui/status-pill"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Tone } from "@/lib/design/status"

export type OnDemandDeckListRow = {
  id: string
  clientName: string | null
  mbaNumber: string
  status: string
  requestedByEmail: string | null
  note: string | null
  error: string | null
  blobPathname: string | null
}

function toneFor(status: string): Tone {
  if (status === "generated") return "outcome"
  if (status === "failed") return "critical"
  return "neutral"
}

function statusLabel(status: string): string {
  if (status === "generated") return "Generated"
  if (status === "failed") return "Failed"
  if (status === "generating") return "Generating"
  if (status === "queued") return "Queued"
  if (status === "skipped") return "Skipped"
  return status
}

function downloadHref(pathname: string): string {
  return `/api/reports/download?path=${encodeURIComponent(pathname)}`
}

export function OnDemandDecks({ rows }: { rows: OnDemandDeckListRow[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">On-demand decks</h2>
        <p className="text-sm text-muted-foreground">
          Asked for from Review &amp; Report. This list is the month they were requested.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No on-demand decks this month.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>MBA</TableHead>
              <TableHead>Who asked</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.clientName?.trim() || "Unknown client"}</TableCell>
                <TableCell className="num">{row.mbaNumber}</TableCell>
                <TableCell>{row.requestedByEmail?.trim() || "Not recorded"}</TableCell>
                <TableCell>
                  <StatusPill tone={toneFor(row.status)} label={statusLabel(row.status)} />
                  {row.status === "failed" && row.error ? (
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">{row.error}</p>
                  ) : null}
                </TableCell>
                <TableCell>{row.note ?? ""}</TableCell>
                <TableCell>
                  {row.status === "generated" && row.blobPathname ? (
                    <a
                      href={downloadHref(row.blobPathname)}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Download
                    </a>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
