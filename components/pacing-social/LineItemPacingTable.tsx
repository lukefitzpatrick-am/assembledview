"use client";

import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Info } from "lucide-react";
import {
  compareValues,
  type SortDirection,
} from "@/components/ui/sortable-table-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import { inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import {
  formatRatioAsPercent,
  formatVariancePercent,
} from "@/lib/pacing/kpi/formatKpi";
import {
  buildSocialKpiComparisons,
  computeSocialRowKpiStatus,
    type RowKpiStatus,
  type SocialKpiComparison,
  type SocialKpiMetric,
} from "@/lib/pacing/social/computeSocialKpiStatus";
import { kpiStatusPresentation, pacingStatusFromBand } from "@/lib/pacing/status";
import { PACING_TABLE_SCROLL_CLASSNAME } from "@/components/pacing/pacingTableScroll";
import type {
  SocialAdSetBreakdown,
  SocialPacingCampaignRow,
  SocialPacingMetrics,
  SocialPlatform,
  SocialPlatformCampaignBreakdown,
} from "@/lib/pacing/social/types";
import { formatAUD } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const XANO_MISSING = "—";

// results and videoViews are on SocialPacingMetrics but omitted from v1 columns — held for a later column toggle.

type PacingSortColumn =
  | "clientName"
  | "socialPlatform"
  | "campaignName"
  | "mbaNumber"
  | "lineItemId"
  | "lineItemStatus"
  | "creativeTargeting"
  | "kpiStatus"
  | "lineItemStartDate"
  | "lineItemEndDate"
  | "totalLineItemBudget"
  | "totalBursts"
  | "currentBurstIndex"
  | "burstStartDate"
  | "spendToDateLineTotal"
  | "impressions"
  | "clicks"
  | "deliverableActual"
  | "deliverableTarget";

type SortableValue = string | number | boolean | null | undefined;

const LINE_ITEM_STATUS_ORDER: Record<SocialPacingCampaignRow["lineItemStatus"], number> = {
  "on-track": 0,
  ahead: 1,
  behind: 2,
  "over-pacing": 3,
  "no-data": 4,
};

const KPI_STATUS_ORDER: Record<RowKpiStatus, number> = {
  "kpi-on-track": 0,
  "kpi-mixed": 1,
  "kpi-off-target": 2,
  "kpi-no-delivery": 3,
  "kpi-pending": 4,
};

const NUMERIC_SORT_COLUMNS = new Set<PacingSortColumn>([
  "totalLineItemBudget",
  "totalBursts",
  "currentBurstIndex",
  "spendToDateLineTotal",
  "impressions",
  "clicks",
  "deliverableActual",
  "deliverableTarget",
]);

/**
 * Column visibility model: every column lives in exactly one of these two
 * lists. `DEFAULT_COLUMNS` are always rendered; `OPTIONAL_COLUMNS` only when
 * "More columns" is toggled on. Header cells and body cells both check
 * `isColumnVisible(id, moreColumns)` against the same named list, so adding a
 * column to one side without the other is a visible, single-source change
 * instead of a scattered inline-conditional to keep in sync by hand.
 */
const DEFAULT_COLUMNS: readonly PacingSortColumn[] = [
  "clientName",
  "campaignName",
  "lineItemStatus",
  "kpiStatus",
  "totalLineItemBudget",
  "spendToDateLineTotal",
];

const OPTIONAL_COLUMNS: readonly PacingSortColumn[] = [
  "socialPlatform",
  "mbaNumber",
  "lineItemId",
  "creativeTargeting",
  "lineItemStartDate",
  "lineItemEndDate",
  "totalBursts",
  "currentBurstIndex",
  "burstStartDate",
  "impressions",
  "clicks",
  "deliverableActual",
  "deliverableTarget",
];

/** Default columns always render; optional only when "More columns" is on; unclassified never render. */
function isColumnVisible(column: PacingSortColumn, moreColumns: boolean): boolean {
  if (DEFAULT_COLUMNS.includes(column)) return true;
  if (OPTIONAL_COLUMNS.includes(column)) return moreColumns;
  return false;
}

function sortableNumber(value: number | null | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

const ROW_SORT_SELECTORS: Record<
  PacingSortColumn,
  (row: SocialPacingCampaignRow) => SortableValue
> = {
  clientName: (r) => r.clientName,
  socialPlatform: (r) => r.socialPlatform,
  campaignName: (r) => r.campaignName,
  mbaNumber: (r) => r.mbaNumber,
  lineItemId: (r) => r.lineItemId,
  lineItemStatus: (r) => LINE_ITEM_STATUS_ORDER[r.lineItemStatus],
  creativeTargeting: (r) => r.creativeTargeting,
  kpiStatus: (r) => KPI_STATUS_ORDER[computeSocialRowKpiStatus(r)],
  lineItemStartDate: (r) => r.lineItemStartDate ?? "",
  lineItemEndDate: (r) => r.lineItemEndDate ?? "",
  totalLineItemBudget: (r) => r.totalLineItemBudget,
  totalBursts: (r) => r.totalBursts,
  currentBurstIndex: (r) => sortableNumber(r.currentBurstIndex),
  burstStartDate: (r) => r.currentBurst?.startDate ?? "",
  spendToDateLineTotal: (r) => r.spendToDateLineTotal,
  impressions: (r) => r.impressions,
  clicks: (r) => r.clicks,
  deliverableActual: (r) => r.deliverableActual,
  deliverableTarget: (r) => r.deliverableTarget,
};

function SortablePacingTh({
  label,
  column,
  sortColumn,
  sortDirection,
  onToggle,
  className,
  style,
  align = "left",
  hint,
}: {
  label: string;
  column: PacingSortColumn;
  sortColumn: PacingSortColumn | null;
  sortDirection: SortDirection;
  onToggle: (column: PacingSortColumn) => void;
  className?: string;
  style?: CSSProperties;
  align?: "left" | "right";
  hint?: string;
}) {
  const active = sortColumn === column;
  const direction = active ? sortDirection : null;
  const Icon =
    direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th className={className} style={style}>
      <button
        type="button"
        title={hint}
        onClick={() => onToggle(column)}
        className={cn(
          "flex w-full min-w-0 items-center gap-0.5 p-0 font-inherit text-inherit hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start",
        )}
      >
        <span className="whitespace-nowrap">{label}</span>
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
    </th>
  );
}

/**
 * Only Client and Campaign stay pinned on horizontal scroll — everything else
 * (including the expand chevron and Platform) scrolls normally. Campaign's
 * offset is the measured width of the Client column; intervening non-sticky
 * columns simply scroll underneath.
 */
const STICKY_EDGE_SHADOW = "-1px 0 0 hsl(var(--border)) inset";

const LINE_ITEM_BG_CLASS = "bg-card";
const PLATFORM_CAMPAIGN_BG_CLASS = "bg-surface-panel";
const AD_SET_BG_CLASS = "bg-[var(--fill-track)]";

/** Measures the rendered width of the first row's Client cell (the only thing Campaign's offset depends on). */
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

function fmtCurrencyOrZero(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return formatAUD(n);
}

function fmtNumberOrZero(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return new Intl.NumberFormat("en-AU").format(n);
}

function fmtXanoDate(d: string | null): string {
  return d || XANO_MISSING;
}

function fmtCpv(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return formatAUD(n);
}

function formatSocialPlatform(platform: SocialPlatform): string {
  if (platform === "meta") return "Meta";
  if (platform === "tiktok") return "TikTok";
  return platform;
}

function labelForDeliverableMetric(metric: DeliverableMetric): string {
  switch (metric) {
    case "IMPRESSIONS":
      return "Impressions";
    case "CLICKS":
      return "Clicks";
    case "RESULTS":
      return "Results";
    case "VIDEO_3S_VIEWS":
      return "Video 3s views";
  }
}

function deliverableActualFromMetrics(
  metrics: SocialPacingMetrics,
  deliverableMetric: DeliverableMetric,
): number {
  switch (deliverableMetric) {
    case "IMPRESSIONS":
      return metrics.impressions;
    case "CLICKS":
      return metrics.clicks;
    case "RESULTS":
      return metrics.results;
    case "VIDEO_3S_VIEWS":
      return metrics.videoViews;
  }
}

function lineDeliverablePacingPct(
  row: SocialPacingCampaignRow,
  asOfDate: string,
): number | null {
  if (row.deliverableTarget <= 0 || !row.lineItemStartDate || !row.lineItemEndDate) {
    return null;
  }
  const totalDays = inclusiveDaysBetween(row.lineItemStartDate, row.lineItemEndDate);
  if (!totalDays || totalDays <= 0) return null;
  const elapsed = inclusiveDaysBetween(row.lineItemStartDate, asOfDate);
  if (!elapsed || elapsed <= 0) return null;
  const expected = row.deliverableTarget * Math.min(1, elapsed / totalDays);
  if (expected <= 0) return null;
  return (row.deliverableActual / expected) * 100;
}

function deliverableCellTint(row: SocialPacingCampaignRow, asOfDate: string): string {
  const pct = lineDeliverablePacingPct(row, asOfDate);
  if (pct === null) return "";
  const deviation = Math.abs(Number(pct) - 100);
  if (!Number.isFinite(deviation)) return "text-status-on-track-fg";
  if (deviation <= 10) return "text-status-on-track-fg";
  if (deviation <= 20) return "text-status-behind-fg";
  return "text-status-critical-fg";
}

function deliverableMetricTitle(metric: DeliverableMetric, kind: "delivered" | "target"): string {
  const label = labelForDeliverableMetric(metric);
  return kind === "delivered" ? `${label} delivered to date` : `${label} booked target`;
}

export type LineItemPacingTableProps = {
  rows: SocialPacingCampaignRow[];
  asOfDate: string;
};

export function LineItemPacingTable({ rows, asOfDate }: LineItemPacingTableProps) {
  const [expandedLineItems, setExpandedLineItems] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<PacingSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("asc");
  const [moreColumns, setMoreColumns] = useState(false);
  const clientCellRef = useRef<HTMLTableCellElement>(null);
  const clientWidth = useClientColumnWidth(clientCellRef);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    const select = ROW_SORT_SELECTORS[sortColumn];
    return [...rows].sort((a, b) => compareValues(select(a), select(b), sortDirection));
  }, [rows, sortColumn, sortDirection]);

  function toggleSort(column: PacingSortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(NUMERIC_SORT_COLUMNS.has(column) ? "desc" : "asc");
  }

  function toggleLineItem(id: string) {
    setExpandedLineItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCampaign(key: string) {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
        No live Social line items
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
        <div className={PACING_TABLE_SCROLL_CLASSNAME}>
          <table
            className={cn("w-full text-xs", moreColumns ? "min-w-[1200px]" : "min-w-[860px]")}
            style={{ borderSpacing: 0 }}
          >
            <thead>
              <tr className="text-left">
                <th className="sticky top-0 z-20 bg-background p-2 text-left border-b" />
                <SortablePacingTh
                  label="Client"
                  column="clientName"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                  style={stickyClientHeaderStyle()}
                />
                {isColumnVisible("socialPlatform", moreColumns) && (
                  <SortablePacingTh
                    label="Platform"
                    column="socialPlatform"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky top-0 z-20 bg-background p-2 whitespace-nowrap text-left border-b"
                  />
                )}
                <SortablePacingTh
                  label="Campaign / Ad Set"
                  column="campaignName"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  className="sticky bg-background p-2 text-left border-b"
                  style={stickyCampaignHeaderStyle(clientWidth)}
                />
                {isColumnVisible("mbaNumber", moreColumns) && (
                  <SortablePacingTh
                    label="MBA"
                    column="mbaNumber"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky top-0 z-20 bg-background p-2 whitespace-nowrap text-left border-b"
                  />
                )}
                {isColumnVisible("lineItemId", moreColumns) && (
                  <SortablePacingTh
                    label="Line Item ID"
                    column="lineItemId"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky top-0 z-20 bg-background p-2 whitespace-nowrap text-left border-b"
                  />
                )}
                <SortablePacingTh
                  label="Status"
                  hint="Spend pace vs booked budget (same six bands as the tiles)"
                  column="lineItemStatus"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  className="sticky top-0 z-20 bg-background p-2 whitespace-nowrap text-left border-b"
                />
                {isColumnVisible("creativeTargeting", moreColumns) && (
                  <SortablePacingTh
                    label="Targeting"
                    column="creativeTargeting"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky top-0 z-20 bg-background p-2 text-left border-b"
                  />
                )}
                <SortablePacingTh
                  label="KPI Status"
                  column="kpiStatus"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  className="sticky top-0 bg-background p-2 text-left border-b"
                  style={{ zIndex: 20 }}
                />
                {isColumnVisible("lineItemStartDate", moreColumns) && (
                  <SortablePacingTh
                    label="Line Start"
                    column="lineItemStartDate"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("lineItemEndDate", moreColumns) && (
                  <SortablePacingTh
                    label="Line End"
                    column="lineItemEndDate"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                <SortablePacingTh
                  label="Total Budget"
                  column="totalLineItemBudget"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  align="right"
                  className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                  style={{ top: 0, zIndex: 20 }}
                />
                {isColumnVisible("totalBursts", moreColumns) && (
                  <SortablePacingTh
                    label="Bursts"
                    column="totalBursts"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                    className="sticky bg-background p-2 text-right border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("currentBurstIndex", moreColumns) && (
                  <SortablePacingTh
                    label="Current"
                    column="currentBurstIndex"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                    className="sticky bg-background p-2 text-right border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("burstStartDate", moreColumns) && (
                  <SortablePacingTh
                    label="Burst Start"
                    column="burstStartDate"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                <SortablePacingTh
                  label="Spend"
                  hint="Line-item spend to date (all bursts)"
                  column="spendToDateLineTotal"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onToggle={toggleSort}
                  align="right"
                  className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                  style={{ top: 0, zIndex: 20 }}
                />
                {isColumnVisible("impressions", moreColumns) && (
                  <SortablePacingTh
                    label="Impressions"
                    column="impressions"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                    className="sticky bg-background p-2 text-right border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("clicks", moreColumns) && (
                  <SortablePacingTh
                    label="Clicks"
                    column="clicks"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                    className="sticky bg-background p-2 text-right border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("deliverableActual", moreColumns) && (
                  <SortablePacingTh
                    label="Delivered"
                    column="deliverableActual"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                    className="sticky bg-background p-2 text-right border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("deliverableTarget", moreColumns) && (
                  <SortablePacingTh
                    label="Target"
                    column="deliverableTarget"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                    className="sticky bg-background p-2 text-right border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIndex) => (
                <FragmentForLineItem
                  key={`${row.mbaNumber}-${row.lineItemId}-${row.xanoRowId}`}
                  row={row}
                  asOfDate={asOfDate}
                  isExpanded={expandedLineItems.has(row.lineItemId)}
                  onToggle={() => toggleLineItem(row.lineItemId)}
                  expandedCampaigns={expandedCampaigns}
                  onToggleCampaign={toggleCampaign}
                  clientWidth={clientWidth}
                  clientCellRef={rowIndex === 0 ? clientCellRef : undefined}
                  moreColumns={moreColumns}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentForLineItem({
  row,
  asOfDate,
  isExpanded,
  onToggle,
  expandedCampaigns,
  onToggleCampaign,
  clientWidth,
  clientCellRef,
  moreColumns,
}: {
  row: SocialPacingCampaignRow;
  asOfDate: string;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCampaigns: Set<string>;
  onToggleCampaign: (key: string) => void;
  clientWidth: number;
  clientCellRef?: RefObject<HTMLTableCellElement | null>;
  moreColumns: boolean;
}) {
  const hasChildren = row.platformCampaigns.length > 0;
  const deliveredTitle = deliverableMetricTitle(row.deliverableMetric, "delivered");
  const targetTitle = deliverableMetricTitle(row.deliverableMetric, "target");
  const deliveredTint = deliverableCellTint(row, asOfDate);

  return (
    <Fragment>
      <tr
        className={cn(
          "border-t",
          LINE_ITEM_BG_CLASS,
          hasChildren && "cursor-pointer hover:bg-muted/20",
          row.currentBurst === null && "opacity-75",
        )}
        title={
          row.currentBurst === null
            ? "Live line item — no burst contains today (gap between bursts)"
            : undefined
        }
        onClick={hasChildren ? onToggle : undefined}
      >
        <td className="p-2">
          {hasChildren ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td
          ref={clientCellRef}
          className={cn("p-2 font-medium", LINE_ITEM_BG_CLASS)}
          style={stickyClientCellStyle()}
        >
          {row.clientName}
        </td>
        {isColumnVisible("socialPlatform", moreColumns) && (
          <td className="p-2">{formatSocialPlatform(row.socialPlatform)}</td>
        )}
        <td className={cn("p-2", LINE_ITEM_BG_CLASS)} style={stickyCampaignCellStyle(clientWidth)}>
          {row.campaignName}
        </td>
        {isColumnVisible("mbaNumber", moreColumns) && (
          <td className="p-2 font-mono text-[10px]">{row.mbaNumber}</td>
        )}
        {isColumnVisible("lineItemId", moreColumns) && (
          <td className="p-2 font-mono text-[10px]">{row.lineItemId}</td>
        )}
        <td className="p-2">
          <StatusCell status={row.lineItemStatus} />
        </td>
        {isColumnVisible("creativeTargeting", moreColumns) && (
          <td className="p-2 max-w-[8rem] truncate" title={row.creativeTargeting}>
            {row.creativeTargeting || XANO_MISSING}
          </td>
        )}
        <td className="p-2">
          <div className="inline-flex items-center gap-1">
            <KpiStatusPill status={computeSocialRowKpiStatus(row)} />
            <KpiDrilldownButton row={row} />
          </div>
        </td>
        {isColumnVisible("lineItemStartDate", moreColumns) && (
          <td className="p-2">{fmtXanoDate(row.lineItemStartDate)}</td>
        )}
        {isColumnVisible("lineItemEndDate", moreColumns) && (
          <td className="p-2">{fmtXanoDate(row.lineItemEndDate)}</td>
        )}
        <td className="p-2 text-right num">{fmtCurrencyOrZero(row.totalLineItemBudget)}</td>
        {isColumnVisible("totalBursts", moreColumns) && (
          <td className="p-2 text-right num">{row.totalBursts}</td>
        )}
        {isColumnVisible("currentBurstIndex", moreColumns) && (
          <td className="p-2 text-right num">
            {row.currentBurstIndex !== null ? row.currentBurstIndex + 1 : XANO_MISSING}
          </td>
        )}
        {isColumnVisible("burstStartDate", moreColumns) && (
          <td className="p-2">{row.currentBurst?.startDate ?? XANO_MISSING}</td>
        )}
        <td className="p-2 text-right num">{fmtCurrencyOrZero(row.spendToDateLineTotal)}</td>
        {isColumnVisible("impressions", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(row.impressions)}</td>
        )}
        {isColumnVisible("clicks", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(row.clicks)}</td>
        )}
        {isColumnVisible("deliverableActual", moreColumns) && (
          <td className={cn("p-2 text-right num", deliveredTint)} title={deliveredTitle}>
            {fmtNumberOrZero(row.deliverableActual)}
          </td>
        )}
        {isColumnVisible("deliverableTarget", moreColumns) && (
          <td className="p-2 text-right num" title={targetTitle}>
            {fmtNumberOrZero(row.deliverableTarget)}
          </td>
        )}
      </tr>

      {isExpanded &&
        row.platformCampaigns.map((pc) => {
          const key = `${row.lineItemId}|${pc.campaignId}`;
          return (
            <FragmentForCampaign
              key={key}
              row={row}
              campaign={pc}
              isExpanded={expandedCampaigns.has(key)}
              onToggle={() => onToggleCampaign(key)}
              clientWidth={clientWidth}
              moreColumns={moreColumns}
            />
          );
        })}
    </Fragment>
  );
}

function FragmentForCampaign({
  row,
  campaign,
  isExpanded,
  onToggle,
  clientWidth,
  moreColumns,
}: {
  row: SocialPacingCampaignRow;
  campaign: SocialPlatformCampaignBreakdown;
  isExpanded: boolean;
  onToggle: () => void;
  clientWidth: number;
  moreColumns: boolean;
}) {
  const hasAdSets = campaign.adSets.length > 0;
  const delivered = deliverableActualFromMetrics(campaign, row.deliverableMetric);
  const deliveredTitle = deliverableMetricTitle(row.deliverableMetric, "delivered");

  return (
    <Fragment>
      <tr
        className={cn("border-t", PLATFORM_CAMPAIGN_BG_CLASS, hasAdSets && "cursor-pointer hover:bg-muted/25")}
        onClick={hasAdSets ? onToggle : undefined}
      >
        <td className="p-2 pl-6">
          {hasAdSets ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td className={cn("p-2", PLATFORM_CAMPAIGN_BG_CLASS)} style={stickyClientCellStyle()} />
        {isColumnVisible("socialPlatform", moreColumns) && <td className="p-2" />}
        <td
          className={cn("p-2 italic text-foreground/90", PLATFORM_CAMPAIGN_BG_CLASS)}
          style={stickyCampaignCellStyle(clientWidth)}
        >
          {campaign.campaignName || campaign.campaignId}
        </td>
        {isColumnVisible("mbaNumber", moreColumns) && <td className="p-2" />}
        {isColumnVisible("lineItemId", moreColumns) && <td className="p-2" />}
        <td className="p-2" />
        {isColumnVisible("creativeTargeting", moreColumns) && <td className="p-2" />}
        <td className="p-2" />
        {isColumnVisible("lineItemStartDate", moreColumns) && <td className="p-2" />}
        {isColumnVisible("lineItemEndDate", moreColumns) && <td className="p-2" />}
        <td className="p-2" />
        {isColumnVisible("totalBursts", moreColumns) && <td className="p-2" />}
        {isColumnVisible("currentBurstIndex", moreColumns) && <td className="p-2" />}
        {isColumnVisible("burstStartDate", moreColumns) && <td className="p-2" />}
        <td className="p-2 text-right num">{fmtCurrencyOrZero(campaign.spend)}</td>
        {isColumnVisible("impressions", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(campaign.impressions)}</td>
        )}
        {isColumnVisible("clicks", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(campaign.clicks)}</td>
        )}
        {isColumnVisible("deliverableActual", moreColumns) && (
          <td className="p-2 text-right num" title={deliveredTitle}>
            {fmtNumberOrZero(delivered)}
          </td>
        )}
        {isColumnVisible("deliverableTarget", moreColumns) && <td className="p-2" />}
      </tr>

      {isExpanded &&
        campaign.adSets.map((adSet) => (
          <AdSetRow
            key={`${row.lineItemId}|${campaign.campaignId}|${adSet.entityId}`}
            row={row}
            adSet={adSet}
            clientWidth={clientWidth}
            moreColumns={moreColumns}
          />
        ))}
    </Fragment>
  );
}

function AdSetRow({
  row,
  adSet,
  clientWidth,
  moreColumns,
}: {
  row: SocialPacingCampaignRow;
  adSet: SocialAdSetBreakdown;
  clientWidth: number;
  moreColumns: boolean;
}) {
  const delivered = deliverableActualFromMetrics(adSet, row.deliverableMetric);
  const deliveredTitle = deliverableMetricTitle(row.deliverableMetric, "delivered");

  return (
    <tr className={cn("border-t", AD_SET_BG_CLASS)}>
      <td className="p-2 pl-10" />
      <td className={cn("p-2", AD_SET_BG_CLASS)} style={stickyClientCellStyle()} />
      {isColumnVisible("socialPlatform", moreColumns) && <td className="p-2" />}
      <td
        className={cn("p-2 pl-4 text-muted-foreground", AD_SET_BG_CLASS)}
        style={stickyCampaignCellStyle(clientWidth)}
      >
        {adSet.entityName || adSet.entityId}
      </td>
      {isColumnVisible("mbaNumber", moreColumns) && <td className="p-2" />}
      {isColumnVisible("lineItemId", moreColumns) && (
        <td className="p-2 font-mono text-[10px] text-muted-foreground">{adSet.entityId}</td>
      )}
      <td className="p-2" />
      {isColumnVisible("creativeTargeting", moreColumns) && <td className="p-2" />}
      <td className="p-2" />
      {isColumnVisible("lineItemStartDate", moreColumns) && <td className="p-2" />}
      {isColumnVisible("lineItemEndDate", moreColumns) && <td className="p-2" />}
      <td className="p-2" />
      {isColumnVisible("totalBursts", moreColumns) && <td className="p-2" />}
      {isColumnVisible("currentBurstIndex", moreColumns) && <td className="p-2" />}
      {isColumnVisible("burstStartDate", moreColumns) && <td className="p-2" />}
      <td className="p-2 text-right num">{fmtCurrencyOrZero(adSet.spend)}</td>
      {isColumnVisible("impressions", moreColumns) && (
        <td className="p-2 text-right num">{fmtNumberOrZero(adSet.impressions)}</td>
      )}
      {isColumnVisible("clicks", moreColumns) && (
        <td className="p-2 text-right num">{fmtNumberOrZero(adSet.clicks)}</td>
      )}
      {isColumnVisible("deliverableActual", moreColumns) && (
        <td className="p-2 text-right num" title={deliveredTitle}>
          {fmtNumberOrZero(delivered)}
        </td>
      )}
      {isColumnVisible("deliverableTarget", moreColumns) && <td className="p-2" />}
    </tr>
  );
}

function StatusCell({ status }: { status: SocialPacingCampaignRow["lineItemStatus"] }) {
  const resolved = pacingStatusFromBand(status);
  return (
    <Badge variant={resolved.badgeVariant} size="sm" className="whitespace-nowrap text-[10px]">
      {resolved.label}
    </Badge>
  );
}

function KpiStatusPill({ status }: { status: RowKpiStatus }) {
  const resolved = kpiStatusPresentation(status);
  return (
    <Badge variant={resolved.badgeVariant} size="sm" className="whitespace-nowrap text-[10px]">
      {resolved.label}
    </Badge>
  );
}

function KpiDrilldownButton({ row }: { row: SocialPacingCampaignRow }) {
  const comparisons = buildSocialKpiComparisons(row);
  const hasTargets = row.kpiTargets !== null;
  const editorHref = `/mediaplans/mba/${encodeURIComponent(row.mbaNumber)}/edit`;
  const frequencyTarget = resolveFrequencyTarget(row);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="KPI breakdown"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <KpiDrilldownContent
          row={row}
          comparisons={comparisons}
          hasTargets={hasTargets}
          frequencyTarget={frequencyTarget}
          editorHref={editorHref}
        />
      </PopoverContent>
    </Popover>
  );
}

function resolveFrequencyTarget(row: SocialPacingCampaignRow): number | null {
  const frequency = row.kpiTargets?.frequency;
  if (frequency === null || frequency === undefined || frequency === 0) return null;
  return frequency;
}

function KpiDrilldownContent({
  row,
  comparisons,
  hasTargets,
  frequencyTarget,
  editorHref,
}: {
  row: SocialPacingCampaignRow;
  comparisons: SocialKpiComparison[];
  hasTargets: boolean;
  frequencyTarget: number | null;
  editorHref: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium">{row.lineItemId}</div>
        <div className="text-[10px] text-muted-foreground">{row.campaignName}</div>
      </div>

      {!hasTargets ? (
        <EmptyKpiState editorHref={editorHref} />
      ) : (
        <>
          <SocialKpiComparisonTable
            comparisons={comparisons}
            frequencyTarget={frequencyTarget}
          />
          <div className="border-t pt-2">
            <a
              href={editorHref}
              className="text-[11px] text-primary hover:text-primary/80 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Edit targets in media plan →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyKpiState({ editorHref }: { editorHref: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        No KPI targets have been set for this line item yet.
      </p>
      <a
        href={editorHref}
        className="inline-block text-[11px] text-primary hover:text-primary/80 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Set targets in media plan →
      </a>
    </div>
  );
}

function labelForSocialMetric(metric: SocialKpiMetric): string {
  switch (metric) {
    case "ctr":
      return "CTR";
    case "conversionRate":
      return "Conv. rate (results/impr)";
    case "cpv":
      return "CPV ↓";
    case "vtr":
      return "VTR";
  }
}

function SocialKpiComparisonTable({
  comparisons,
  frequencyTarget,
}: {
  comparisons: SocialKpiComparison[];
  frequencyTarget: number | null;
}) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left font-normal pb-1">Metric</th>
          <th className="text-right font-normal pb-1">Target</th>
          <th className="text-right font-normal pb-1">Actual</th>
          <th className="text-right font-normal pb-1">Variance</th>
        </tr>
      </thead>
      <tbody>
        {comparisons.map((c) => (
          <SocialKpiComparisonRow key={c.metric} comparison={c} />
        ))}
        {frequencyTarget !== null ? (
          <tr>
            <td className="py-0.5 pr-2">Frequency</td>
            <td className="num py-0.5 pr-2 text-right">
              {fmtNumberOrZero(frequencyTarget)}
            </td>
            {/* Social facts have no reach column — frequency has no actual. */}
            <td className="num py-0.5 pr-2 text-right text-muted-foreground">
              {XANO_MISSING}
            </td>
            <td className="num py-0.5 text-right text-muted-foreground">
              {XANO_MISSING}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function SocialKpiComparisonRow({ comparison: c }: { comparison: SocialKpiComparison }) {
  const isLowerBetter = c.metric === "cpv";
  const varianceClass =
    c.variancePercent === null
      ? "text-muted-foreground"
      : isLowerBetter
        ? c.variancePercent <= 0
          ? "text-status-ahead-fg"
          : "text-status-critical-fg"
        : c.variancePercent >= 0
          ? "text-status-ahead-fg"
          : "text-status-critical-fg";

  const actualDisplay =
    c.status === "no-target" ? (
      <span className="text-muted-foreground text-[10px]">Target not set</span>
    ) : c.status === "no-delivery" ? (
      <span className="text-muted-foreground text-[10px]">No delivery yet</span>
    ) : c.metric === "cpv" ? (
      fmtCpv(c.actual)
    ) : (
      formatRatioAsPercent(c.actual)
    );

  const targetDisplay =
    c.status === "no-target"
      ? XANO_MISSING
      : c.metric === "cpv"
        ? fmtCpv(c.target)
        : formatRatioAsPercent(c.target);

  return (
    <tr>
      <td className="py-0.5 pr-2">
        <span title={isLowerBetter ? "Lower is better" : undefined}>
          {labelForSocialMetric(c.metric)}
        </span>
      </td>
      <td className="num py-0.5 pr-2 text-right">{targetDisplay}</td>
      <td className="num py-0.5 pr-2 text-right">{actualDisplay}</td>
      <td className={`num py-0.5 text-right ${varianceClass}`}>
        {formatVariancePercent(c.variancePercent)}
      </td>
    </tr>
  );
}
