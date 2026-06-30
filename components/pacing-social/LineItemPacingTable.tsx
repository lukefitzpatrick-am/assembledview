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
  copyForRowKpiStatus,
  type RowKpiStatus,
  type SocialKpiComparison,
  type SocialKpiMetric,
} from "@/lib/pacing/social/computeSocialKpiStatus";
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
  "no-data": 3,
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
}: {
  label: string;
  column: PacingSortColumn;
  sortColumn: PacingSortColumn | null;
  sortDirection: SortDirection;
  onToggle: (column: PacingSortColumn) => void;
  className?: string;
  style?: CSSProperties;
  align?: "left" | "right";
}) {
  const active = sortColumn === column;
  const direction = active ? sortDirection : null;
  const Icon =
    direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th className={className} style={style}>
      <button
        type="button"
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
 * Sticky left columns:
 *   0: chevron
 *   1: Client
 *   2: Platform
 *   3: Campaign / Ad Set
 *   4: MBA
 *   5: Line Item ID
 *   6: Status
 *   7: Targeting
 */
const STICKY_LEFT_COUNT = 8;

const LINE_ITEM_BG = "hsl(var(--card))";
const PLATFORM_CAMPAIGN_BG = "hsl(var(--surface-panel))";
const AD_SET_BG = "var(--fill-track)";

const TARGETING_COLUMN_SHADOW = "-1px 0 0 hsl(var(--border)) inset";

const statusLabel: Record<SocialPacingCampaignRow["lineItemStatus"], string> = {
  "on-track": "On track",
  ahead: "Ahead",
  behind: "Off pace",
  "no-data": "No data",
};

function statusBadgeVariant(
  status: SocialPacingCampaignRow["lineItemStatus"],
): "on-track" | "ahead" | "behind" | "secondary" {
  switch (status) {
    case "on-track":
      return "on-track";
    case "ahead":
      return "ahead";
    case "behind":
      return "behind";
    case "no-data":
      return "secondary";
  }
}

function kpiStatusBadgeVariant(status: RowKpiStatus): "secondary" | "on-track" | "behind" | "critical" {
  switch (status) {
    case "kpi-pending":
    case "kpi-no-delivery":
      return "secondary";
    case "kpi-on-track":
      return "on-track";
    case "kpi-mixed":
      return "behind";
    case "kpi-off-target":
      return "critical";
  }
}

function computeLeftOffsets(widths: number[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (let i = 0; i < widths.length; i++) {
    offsets.push(running);
    running += widths[i];
  }
  return offsets;
}

function useStickyLeftOffsets(
  firstRowRef: RefObject<HTMLTableRowElement | null>,
): number[] {
  const [offsets, setOffsets] = useState<number[]>(() =>
    new Array(STICKY_LEFT_COUNT).fill(0),
  );

  useLayoutEffect(() => {
    const row = firstRowRef.current;
    if (!row) return;

    const measure = () => {
      const cells = Array.from(row.children) as HTMLTableCellElement[];
      const widths: number[] = [];
      for (let i = 0; i < STICKY_LEFT_COUNT; i++) {
        const cell = cells[i];
        widths.push(cell ? cell.getBoundingClientRect().width : 0);
      }
      setOffsets(computeLeftOffsets(widths));
    };

    measure();

    const observer = new ResizeObserver(() => measure());
    observer.observe(row);
    const cells = Array.from(row.children) as HTMLTableCellElement[];
    for (let i = 0; i < Math.min(STICKY_LEFT_COUNT, cells.length); i++) {
      observer.observe(cells[i]);
    }

    return () => observer.disconnect();
  }, [firstRowRef]);

  return offsets;
}

function stickyLeftCellStyle(
  columnIndex: number,
  leftOffsets: number[],
  background: string,
): CSSProperties {
  return {
    position: "sticky",
    left: leftOffsets[columnIndex],
    background,
    zIndex: 10,
    ...(columnIndex === 7 ? { boxShadow: TARGETING_COLUMN_SHADOW } : {}),
  };
}

function stickyHeaderCornerStyle(
  columnIndex: number,
  leftOffsets: number[],
): CSSProperties {
  return {
    top: 0,
    left: leftOffsets[columnIndex],
    zIndex: 30,
    ...(columnIndex === 7 ? { boxShadow: TARGETING_COLUMN_SHADOW } : {}),
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
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const leftOffsets = useStickyLeftOffsets(firstRowRef);

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
    <div className="rounded border">
      <div className="relative max-h-[calc(100vh-220px)] overflow-auto">
        <table className="w-full min-w-[1200px] text-xs" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="text-left">
              <th
                className="sticky bg-background p-2 text-left border-b"
                style={stickyHeaderCornerStyle(0, leftOffsets)}
              />
              <SortablePacingTh
                label="Client"
                column="clientName"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(1, leftOffsets)}
              />
              <SortablePacingTh
                label="Platform"
                column="socialPlatform"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(2, leftOffsets)}
              />
              <SortablePacingTh
                label="Campaign / Ad Set"
                column="campaignName"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 text-left border-b"
                style={stickyHeaderCornerStyle(3, leftOffsets)}
              />
              <SortablePacingTh
                label="MBA"
                column="mbaNumber"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(4, leftOffsets)}
              />
              <SortablePacingTh
                label="Line Item ID"
                column="lineItemId"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(5, leftOffsets)}
              />
              <SortablePacingTh
                label="Status"
                column="lineItemStatus"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(6, leftOffsets)}
              />
              <SortablePacingTh
                label="Targeting"
                column="creativeTargeting"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 text-left border-b"
                style={stickyHeaderCornerStyle(7, leftOffsets)}
              />
              <SortablePacingTh
                label="KPI Status"
                column="kpiStatus"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky top-0 bg-background p-2 text-left border-b"
                style={{ zIndex: 20 }}
              />
              <SortablePacingTh
                label="Line Start"
                column="lineItemStartDate"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Line End"
                column="lineItemEndDate"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              />
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
              <SortablePacingTh
                label="Burst Start"
                column="burstStartDate"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Spend"
                column="spendToDateLineTotal"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
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
                leftOffsets={leftOffsets}
                firstRowRef={rowIndex === 0 ? firstRowRef : undefined}
              />
            ))}
          </tbody>
        </table>
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
  leftOffsets,
  firstRowRef,
}: {
  row: SocialPacingCampaignRow;
  asOfDate: string;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCampaigns: Set<string>;
  onToggleCampaign: (key: string) => void;
  leftOffsets: number[];
  firstRowRef?: RefObject<HTMLTableRowElement | null>;
}) {
  const hasChildren = row.platformCampaigns.length > 0;
  const deliveredTitle = deliverableMetricTitle(row.deliverableMetric, "delivered");
  const targetTitle = deliverableMetricTitle(row.deliverableMetric, "target");
  const deliveredTint = deliverableCellTint(row, asOfDate);

  return (
    <Fragment>
      <tr
        ref={firstRowRef}
        className={`border-t ${hasChildren ? "cursor-pointer hover:bg-muted/20" : ""} ${row.currentBurst === null ? "opacity-75" : ""}`}
        style={{ background: LINE_ITEM_BG }}
        title={
          row.currentBurst === null
            ? "Live line item — no burst contains today (gap between bursts)"
            : undefined
        }
        onClick={hasChildren ? onToggle : undefined}
      >
        <td className="p-2 border-b" style={stickyLeftCellStyle(0, leftOffsets, LINE_ITEM_BG)}>
          {hasChildren ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td
          className="p-2 border-b font-medium"
          style={stickyLeftCellStyle(1, leftOffsets, LINE_ITEM_BG)}
        >
          {row.clientName}
        </td>
        <td className="p-2 border-b" style={stickyLeftCellStyle(2, leftOffsets, LINE_ITEM_BG)}>
          {formatSocialPlatform(row.socialPlatform)}
        </td>
        <td className="p-2 border-b" style={stickyLeftCellStyle(3, leftOffsets, LINE_ITEM_BG)}>
          {row.campaignName}
        </td>
        <td
          className="p-2 border-b font-mono text-[10px]"
          style={stickyLeftCellStyle(4, leftOffsets, LINE_ITEM_BG)}
        >
          {row.mbaNumber}
        </td>
        <td
          className="p-2 border-b font-mono text-[10px]"
          style={stickyLeftCellStyle(5, leftOffsets, LINE_ITEM_BG)}
        >
          {row.lineItemId}
        </td>
        <td className="p-2 border-b" style={stickyLeftCellStyle(6, leftOffsets, LINE_ITEM_BG)}>
          <StatusCell status={row.lineItemStatus} />
        </td>
        <td
          className="p-2 border-b max-w-[8rem] truncate"
          style={stickyLeftCellStyle(7, leftOffsets, LINE_ITEM_BG)}
          title={row.creativeTargeting}
        >
          {row.creativeTargeting || XANO_MISSING}
        </td>
        <td className="p-2 border-b">
          <div className="inline-flex items-center gap-1">
            <KpiStatusPill status={computeSocialRowKpiStatus(row)} />
            <KpiDrilldownButton row={row} />
          </div>
        </td>
        <td className="p-2 border-b">{fmtXanoDate(row.lineItemStartDate)}</td>
        <td className="p-2 border-b">{fmtXanoDate(row.lineItemEndDate)}</td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.totalLineItemBudget)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">{row.totalBursts}</td>
        <td className="p-2 border-b text-right tabular-nums">
          {row.currentBurstIndex !== null ? row.currentBurstIndex + 1 : XANO_MISSING}
        </td>
        <td className="p-2 border-b">{row.currentBurst?.startDate ?? XANO_MISSING}</td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendToDateLineTotal)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.impressions)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.clicks)}</td>
        <td
          className={cn("p-2 border-b text-right tabular-nums", deliveredTint)}
          title={deliveredTitle}
        >
          {fmtNumberOrZero(row.deliverableActual)}
        </td>
        <td className="p-2 border-b text-right tabular-nums" title={targetTitle}>
          {fmtNumberOrZero(row.deliverableTarget)}
        </td>
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
              leftOffsets={leftOffsets}
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
  leftOffsets,
}: {
  row: SocialPacingCampaignRow;
  campaign: SocialPlatformCampaignBreakdown;
  isExpanded: boolean;
  onToggle: () => void;
  leftOffsets: number[];
}) {
  const hasAdSets = campaign.adSets.length > 0;
  const delivered = deliverableActualFromMetrics(campaign, row.deliverableMetric);
  const deliveredTitle = deliverableMetricTitle(row.deliverableMetric, "delivered");

  return (
    <Fragment>
      <tr
        className={`border-t ${hasAdSets ? "cursor-pointer hover:bg-muted/25" : ""}`}
        style={{ background: PLATFORM_CAMPAIGN_BG }}
        onClick={hasAdSets ? onToggle : undefined}
      >
        <td
          className="p-2 border-b pl-6"
          style={stickyLeftCellStyle(0, leftOffsets, PLATFORM_CAMPAIGN_BG)}
        >
          {hasAdSets ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td className="p-2 border-b" style={stickyLeftCellStyle(1, leftOffsets, PLATFORM_CAMPAIGN_BG)} />
        <td className="p-2 border-b" style={stickyLeftCellStyle(2, leftOffsets, PLATFORM_CAMPAIGN_BG)} />
        <td
          className="p-2 border-b italic text-foreground/90"
          style={stickyLeftCellStyle(3, leftOffsets, PLATFORM_CAMPAIGN_BG)}
        >
          {campaign.campaignName || campaign.campaignId}
        </td>
        <td className="p-2 border-b" style={stickyLeftCellStyle(4, leftOffsets, PLATFORM_CAMPAIGN_BG)} />
        <td className="p-2 border-b" style={stickyLeftCellStyle(5, leftOffsets, PLATFORM_CAMPAIGN_BG)} />
        <td className="p-2 border-b" style={stickyLeftCellStyle(6, leftOffsets, PLATFORM_CAMPAIGN_BG)} />
        <td className="p-2 border-b" style={stickyLeftCellStyle(7, leftOffsets, PLATFORM_CAMPAIGN_BG)} />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b text-right tabular-nums">{fmtCurrencyOrZero(campaign.spend)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(campaign.impressions)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(campaign.clicks)}</td>
        <td className="p-2 border-b text-right tabular-nums" title={deliveredTitle}>
          {fmtNumberOrZero(delivered)}
        </td>
        <td className="p-2 border-b" />
      </tr>

      {isExpanded &&
        campaign.adSets.map((adSet) => (
          <AdSetRow key={`${row.lineItemId}|${campaign.campaignId}|${adSet.entityId}`} row={row} adSet={adSet} leftOffsets={leftOffsets} />
        ))}
    </Fragment>
  );
}

function AdSetRow({
  row,
  adSet,
  leftOffsets,
}: {
  row: SocialPacingCampaignRow;
  adSet: SocialAdSetBreakdown;
  leftOffsets: number[];
}) {
  const delivered = deliverableActualFromMetrics(adSet, row.deliverableMetric);
  const deliveredTitle = deliverableMetricTitle(row.deliverableMetric, "delivered");

  return (
    <tr className="border-t" style={{ background: AD_SET_BG }}>
      <td className="p-2 border-b pl-10" style={stickyLeftCellStyle(0, leftOffsets, AD_SET_BG)} />
      <td className="p-2 border-b" style={stickyLeftCellStyle(1, leftOffsets, AD_SET_BG)} />
      <td className="p-2 border-b" style={stickyLeftCellStyle(2, leftOffsets, AD_SET_BG)} />
      <td
        className="p-2 border-b pl-4 text-muted-foreground"
        style={stickyLeftCellStyle(3, leftOffsets, AD_SET_BG)}
      >
        {adSet.entityName || adSet.entityId}
      </td>
      <td className="p-2 border-b" style={stickyLeftCellStyle(4, leftOffsets, AD_SET_BG)} />
      <td
        className="p-2 border-b font-mono text-[10px] text-muted-foreground"
        style={stickyLeftCellStyle(5, leftOffsets, AD_SET_BG)}
      >
        {adSet.entityId}
      </td>
      <td className="p-2 border-b" style={stickyLeftCellStyle(6, leftOffsets, AD_SET_BG)} />
      <td className="p-2 border-b" style={stickyLeftCellStyle(7, leftOffsets, AD_SET_BG)} />
      <td className="p-2 border-b" />
      <td className="p-2 border-b" />
      <td className="p-2 border-b" />
      <td className="p-2 border-b" />
      <td className="p-2 border-b" />
      <td className="p-2 border-b" />
      <td className="p-2 border-b" />
      <td className="p-2 border-b text-right tabular-nums">{fmtCurrencyOrZero(adSet.spend)}</td>
      <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(adSet.impressions)}</td>
      <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(adSet.clicks)}</td>
      <td className="p-2 border-b text-right tabular-nums" title={deliveredTitle}>
        {fmtNumberOrZero(delivered)}
      </td>
      <td className="p-2 border-b" />
    </tr>
  );
}

function StatusCell({ status }: { status: SocialPacingCampaignRow["lineItemStatus"] }) {
  if (status === "no-data") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant={statusBadgeVariant(status)} size="sm" className="whitespace-nowrap text-[10px]">
      {statusLabel[status]}
    </Badge>
  );
}

function KpiStatusPill({ status }: { status: RowKpiStatus }) {
  const copy = copyForRowKpiStatus(status);
  return (
    <Badge variant={kpiStatusBadgeVariant(status)} size="sm" className="whitespace-nowrap text-[10px]">
      {copy}
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
