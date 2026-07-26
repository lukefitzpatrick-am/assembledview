"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  compareValues,
  type SortDirection,
} from "@/components/ui/sortable-table-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/**
 * Column visibility model: every column lives in exactly one of these two
 * lists. `DEFAULT_COLUMNS` are always rendered; `OPTIONAL_COLUMNS` only when
 * "More columns" is toggled on. Header cells and body cells both check
 * `isColumnVisible(id, moreColumns)` against the same named list, so adding a
 * column to one side without the other is a visible, single-source change
 * instead of a scattered inline-conditional to keep in sync by hand.
 */
const DEFAULT_COLUMNS: readonly SortColumn[] = [
  "clientName",
  "campaignName",
  "lineItemStatus",
  "impressions",
  "deliverableProgress",
];

const OPTIONAL_COLUMNS: readonly SortColumn[] = [
  "channelFamily",
  "mbaNumber",
  "lineItemId",
  "clicks",
  "ctr",
  "videoCompletes",
  "results",
  "daysActive",
];

/** Default columns always render; optional only when "More columns" is on; unclassified never render. */
function isColumnVisible(column: SortColumn, moreColumns: boolean): boolean {
  if (DEFAULT_COLUMNS.includes(column)) return true;
  if (OPTIONAL_COLUMNS.includes(column)) return moreColumns;
  return false;
}

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

/**
 * Only Client and Campaign stay pinned on horizontal scroll. Campaign's
 * offset is the measured width of the Client column; everything else scrolls
 * normally underneath.
 */
const STICKY_EDGE_SHADOW = "-1px 0 0 hsl(var(--border)) inset";

function useClientColumnWidth(clientCellRef: RefObject<HTMLTableCellElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const cell = clientCellRef.current;
    if (!cell) return;

    const measure = () => setWidth(cell.getBoundingClientRect().width);
    measure();

    const observer = new ResizeObserver(() => measure());
    observer.observe(cell);
    return () => observer.disconnect();
  }, [clientCellRef]);

  return width;
}

function stickyClientCellStyle(): CSSProperties {
  return { position: "sticky", left: 0, zIndex: 10 };
}

function stickyCampaignCellStyle(clientWidth: number): CSSProperties {
  return {
    position: "sticky",
    left: clientWidth,
    zIndex: 10,
    boxShadow: STICKY_EDGE_SHADOW,
  };
}

function stickyClientHeaderStyle(): CSSProperties {
  return { position: "sticky", top: 0, left: 0, zIndex: 30 };
}

function stickyCampaignHeaderStyle(clientWidth: number): CSSProperties {
  return {
    position: "sticky",
    top: 0,
    left: clientWidth,
    zIndex: 30,
    boxShadow: STICKY_EDGE_SHADOW,
  };
}

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
  className,
  style,
}: {
  label: string;
  column: SortColumn;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onToggle: (c: SortColumn) => void;
  align?: "left" | "right";
  className?: string;
  style?: CSSProperties;
}) {
  const active = sortColumn === column;
  const direction = active ? sortDirection : null;
  const Icon =
    direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th
      className={cn("sticky top-0 z-20 bg-background border-b p-2 whitespace-nowrap", className)}
      style={style}
    >
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
  const [moreColumns, setMoreColumns] = useState(false);
  const clientCellRef = useRef<HTMLTableCellElement>(null);
  const clientWidth = useClientColumnWidth(clientCellRef);

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
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => setMoreColumns((v) => !v)}
        >
          {moreColumns ? "Fewer columns" : "More columns"}
        </Button>
      </div>
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
                  style={stickyClientHeaderStyle()}
                />
                {isColumnVisible("channelFamily", moreColumns) && (
                  <SortTh
                    label="Channel"
                    column="channelFamily"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                  />
                )}
                <SortTh
                  label="Campaign"
                  column="campaignName"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  style={stickyCampaignHeaderStyle(clientWidth)}
                />
                {isColumnVisible("mbaNumber", moreColumns) && (
                  <SortTh
                    label="MBA"
                    column="mbaNumber"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                  />
                )}
                {isColumnVisible("lineItemId", moreColumns) && (
                  <SortTh
                    label="Line Item ID"
                    column="lineItemId"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                  />
                )}
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
                {isColumnVisible("clicks", moreColumns) && (
                  <SortTh
                    label="Clicks"
                    column="clicks"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                )}
                {isColumnVisible("ctr", moreColumns) && (
                  <SortTh
                    label="CTR"
                    column="ctr"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                )}
                {isColumnVisible("videoCompletes", moreColumns) && (
                  <SortTh
                    label="Video completes"
                    column="videoCompletes"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                )}
                {isColumnVisible("results", moreColumns) && (
                  <SortTh
                    label="Results"
                    column="results"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                )}
                {isColumnVisible("daysActive", moreColumns) && (
                  <SortTh
                    label="Days active"
                    column="daysActive"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                )}
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
              {sorted.map((row, rowIndex) => (
                <tr key={`${row.mbaNumber}|${row.lineItemId}`} className="border-t hover:bg-muted/20">
                  <td
                    ref={rowIndex === 0 ? clientCellRef : undefined}
                    className="p-2 font-medium bg-card"
                    style={stickyClientCellStyle()}
                  >
                    {row.clientName}
                  </td>
                  {isColumnVisible("channelFamily", moreColumns) && (
                    <td className="p-2">{channelLabel(row.channelFamily)}</td>
                  )}
                  <td className="p-2 bg-card" style={stickyCampaignCellStyle(clientWidth)}>
                    {row.campaignName}
                  </td>
                  {isColumnVisible("mbaNumber", moreColumns) && (
                    <td className="p-2 font-mono text-[10px]">{row.mbaNumber}</td>
                  )}
                  {isColumnVisible("lineItemId", moreColumns) && (
                    <td className="p-2 font-mono text-[10px]">{row.lineItemId}</td>
                  )}
                  <td className="p-2">
                    {row.lineItemStatus === "serving" ? (
                      <Badge variant="on-track" size="sm" className="whitespace-nowrap text-[10px]">
                        Serving
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">No data yet</span>
                    )}
                  </td>
                  <td className="p-2 text-right num">{fmtNum(row.impressions)}</td>
                  {isColumnVisible("clicks", moreColumns) && (
                    <td className="p-2 text-right num">{fmtNum(row.clicks)}</td>
                  )}
                  {isColumnVisible("ctr", moreColumns) && (
                    <td className="p-2 text-right num">{fmtCtr(row.ctr)}</td>
                  )}
                  {isColumnVisible("videoCompletes", moreColumns) && (
                    <td className="p-2 text-right num">{fmtNum(row.videoCompletes)}</td>
                  )}
                  {isColumnVisible("results", moreColumns) && (
                    <td className="p-2 text-right num">{fmtNum(row.results)}</td>
                  )}
                  {isColumnVisible("daysActive", moreColumns) && (
                    <td className="p-2 text-right num">{fmtNum(row.daysActive)}</td>
                  )}
                  <td
                    className="p-2 text-right num"
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
    </div>
  );
}
