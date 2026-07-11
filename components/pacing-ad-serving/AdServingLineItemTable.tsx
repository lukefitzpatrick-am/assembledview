"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  compareValues,
  type SortDirection,
} from "@/components/ui/sortable-table-header";
import { Badge } from "@/components/ui/badge";
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import { cn } from "@/lib/utils";

const MISSING = "\u2014";

type SortColumn =
  | "clientName"
  | "channelFamily"
  | "campaignName"
  | "mbaNumber"
  | "lineItemId"
  | "lineItemStatus"
  | "impressions"
  | "clicks"
  | "ctr"
  | "videoCompletes"
  | "results"
  | "daysActive"
  | "deliverableProgress";

const NUMERIC = new Set<SortColumn>([
  "impressions",
  "clicks",
  "ctr",
  "videoCompletes",
  "results",
  "daysActive",
  "deliverableProgress",
]);

const SELECTORS: Record<SortColumn, (r: AdServingPacingCampaignRow) => string | number | null> = {
  clientName: (r) => r.clientName,
  channelFamily: (r) => r.channelFamily,
  campaignName: (r) => r.campaignName,
  mbaNumber: (r) => r.mbaNumber,
  lineItemId: (r) => r.lineItemId,
  lineItemStatus: (r) => (r.lineItemStatus === "serving" ? 0 : 1),
  impressions: (r) => r.impressions,
  clicks: (r) => r.clicks,
  ctr: (r) => r.ctr,
  videoCompletes: (r) => r.videoCompletes,
  results: (r) => r.results,
  daysActive: (r) => r.daysActive,
  deliverableProgress: (r) => r.deliverableProgress,
};

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return MISSING;
  return new Intl.NumberFormat("en-AU").format(n);
}

function fmtCtr(n: number | null): string {
  if (n === null) return MISSING;
  return `${(n * 100).toFixed(2)}%`;
}

function fmtProgress(n: number | null): string {
  if (n === null) return MISSING;
  return `${Math.round(n * 100)}%`;
}

function channelLabel(family: AdServingPacingCampaignRow["channelFamily"]): string {
  switch (family) {
    case "digitalDisplay":
      return "Digital Display";
    case "digitalVideo":
      return "Digital Video";
    case "digitalAudio":
      return "Digital Audio";
    case "bvod":
      return "BVOD";
  }
}

function SortTh({
  label,
  column,
  sortColumn,
  sortDirection,
  onToggle,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onToggle: (c: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sortColumn === column;
  const direction = active ? sortDirection : null;
  const Icon =
    direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th className="sticky top-0 z-20 bg-background border-b p-2 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={cn(
          "flex w-full min-w-0 items-center gap-0.5 p-0 font-inherit text-inherit hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start"
        )}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
    </th>
  );
}

export function AdServingLineItemTable({
  rows,
}: {
  rows: AdServingPacingCampaignRow[];
  asOfDate: string;
}) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>("clientName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(NUMERIC.has(column) ? "desc" : "asc");
  }

  const sorted = useMemo(() => {
    if (!sortColumn || !sortDirection) return rows;
    const sel = SELECTORS[sortColumn];
    return [...rows].sort((a, b) =>
      compareValues(sel(a), sel(b), sortDirection)
    );
  }, [rows, sortColumn, sortDirection]);

  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
        No Ad Serving verification rows for live digital line items
      </div>
    );
  }

  return (
    <div className="rounded border">
      <div className="relative max-h-[calc(100vh-220px)] overflow-auto">
        <table className="w-full min-w-[1100px] text-xs" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="text-left">
              <SortTh
                label="Client"
                column="clientName"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
              />
              <SortTh
                label="Channel"
                column="channelFamily"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
              />
              <SortTh
                label="Campaign"
                column="campaignName"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
              />
              <SortTh
                label="MBA"
                column="mbaNumber"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
              />
              <SortTh
                label="Line Item ID"
                column="lineItemId"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
              />
              <SortTh
                label="Status"
                column="lineItemStatus"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
              />
              <SortTh
                label="Impressions"
                column="impressions"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
              <SortTh
                label="Clicks"
                column="clicks"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
              <SortTh
                label="CTR"
                column="ctr"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
              <SortTh
                label="Video completes"
                column="videoCompletes"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
              <SortTh
                label="Results"
                column="results"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
              <SortTh
                label="Days active"
                column="daysActive"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
              <SortTh
                label="vs plan"
                column="deliverableProgress"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={`${row.mbaNumber}|${row.lineItemId}`} className="border-t hover:bg-muted/20">
                <td className="p-2 border-b font-medium">{row.clientName}</td>
                <td className="p-2 border-b">{channelLabel(row.channelFamily)}</td>
                <td className="p-2 border-b">{row.campaignName}</td>
                <td className="p-2 border-b font-mono text-[10px]">{row.mbaNumber}</td>
                <td className="p-2 border-b font-mono text-[10px]">{row.lineItemId}</td>
                <td className="p-2 border-b">
                  {row.lineItemStatus === "serving" ? (
                    <Badge variant="on-track" size="sm" className="whitespace-nowrap text-[10px]">
                      Serving
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">No data yet</span>
                  )}
                </td>
                <td className="p-2 border-b text-right tabular-nums num">
                  {fmtNum(row.impressions)}
                </td>
                <td className="p-2 border-b text-right tabular-nums num">{fmtNum(row.clicks)}</td>
                <td className="p-2 border-b text-right tabular-nums num">{fmtCtr(row.ctr)}</td>
                <td className="p-2 border-b text-right tabular-nums num">
                  {fmtNum(row.videoCompletes)}
                </td>
                <td className="p-2 border-b text-right tabular-nums num">{fmtNum(row.results)}</td>
                <td className="p-2 border-b text-right tabular-nums num">{fmtNum(row.daysActive)}</td>
                <td
                  className="p-2 border-b text-right tabular-nums num"
                  title={
                    row.deliverableKind
                      ? `${fmtNum(row.deliverableActual)} / ${fmtNum(row.deliverableTarget)} ${row.deliverableKind}`
                      : "No plan deliverable goal"
                  }
                >
                  {fmtProgress(row.deliverableProgress)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
