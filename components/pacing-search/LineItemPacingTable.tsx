"use client";

import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Info } from "lucide-react";
import {
  compareValues,
  type SortDirection,
} from "@/components/ui/sortable-table-header";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { statusBadge, statusLabel } from "@/components/dashboard/delivery/shared/statusColours";
import { slugifyClientName } from "@/lib/api/dashboard/shared";
import {
  buildKpiComparisons,
  computeRowKpiStatus,
  copyForRowKpiStatus,
  type KpiComparison,
  type RowKpiStatus,
} from "@/lib/pacing/kpi/computeKpiStatus";
import {
  formatRatioAsPercent,
  formatVariancePercent,
  labelForMetric,
} from "@/lib/pacing/kpi/formatKpi";
import { ctrCellTint } from "@/lib/pacing/kpi/kpiCellColor";
import { createPacingKpiHost } from "@/components/kpis/kpiHost";
import { KPIEditModal } from "@/components/kpis/KPIEditModal";
import { syncCampaignKPIs } from "@/lib/api/kpi";
import type { ResolvedKPIRow } from "@/lib/kpi/types";
import { applySyncedTargetsToRow } from "@/lib/pacing/kpi/applySyncedTargets";
import { buildResolvedKpiRowFromPacing } from "@/lib/pacing/kpi/buildResolvedRow";
import { buildSyncPayloadFromEditedRow } from "@/lib/pacing/kpi/buildSyncPayload";
import type {
  KpiTargets,
  PlatformCampaignBreakdown,
  SearchPacingCampaignRow,
} from "@/lib/pacing/campaigns/types";
import { formatAUD } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const XANO_MISSING = "—";

type PacingSortColumn =
  | "clientName"
  | "platform"
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
  | "burstEndDate"
  | "burstDays"
  | "burstDaysRemaining"
  | "burstBudget"
  | "spendToDateCurrentBurst"
  | "spendYesterday"
  | "spendPerDayRemaining"
  | "spendRemainingCurrentBurst"
  | "spendToDateLineTotal"
  | "spendRemainingLineTotal"
  | "clicks"
  | "cpc"
  | "ctr"
  | "impressions"
  | "conversions";

type SortableValue = string | number | boolean | null | undefined;

const LINE_ITEM_STATUS_ORDER: Record<SearchPacingCampaignRow["lineItemStatus"], number> = {
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
  "burstDays",
  "burstDaysRemaining",
  "burstBudget",
  "spendToDateCurrentBurst",
  "spendYesterday",
  "spendPerDayRemaining",
  "spendRemainingCurrentBurst",
  "spendToDateLineTotal",
  "spendRemainingLineTotal",
  "clicks",
  "cpc",
  "ctr",
  "impressions",
  "conversions",
]);

/** Nullable numerics sort after real values (asc and desc). */
function sortableNumber(value: number | null | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

const ROW_SORT_SELECTORS: Record<
  PacingSortColumn,
  (row: SearchPacingCampaignRow) => SortableValue
> = {
  clientName: (r) => r.clientName,
  platform: (r) => r.platform,
  campaignName: (r) => r.campaignName,
  mbaNumber: (r) => r.mbaNumber,
  lineItemId: (r) => r.lineItemId,
  lineItemStatus: (r) => LINE_ITEM_STATUS_ORDER[r.lineItemStatus],
  creativeTargeting: (r) => r.creativeTargeting,
  kpiStatus: (r) => KPI_STATUS_ORDER[computeRowKpiStatus(r)],
  lineItemStartDate: (r) => r.lineItemStartDate ?? "",
  lineItemEndDate: (r) => r.lineItemEndDate ?? "",
  totalLineItemBudget: (r) => r.totalLineItemBudget,
  totalBursts: (r) => r.totalBursts,
  currentBurstIndex: (r) => sortableNumber(r.currentBurstIndex),
  burstStartDate: (r) => r.currentBurst?.startDate ?? "",
  burstEndDate: (r) => r.currentBurst?.endDate ?? "",
  burstDays: (r) => sortableNumber(r.burstDays),
  burstDaysRemaining: (r) => sortableNumber(r.burstDaysRemaining),
  burstBudget: (r) => sortableNumber(r.currentBurst?.budget),
  spendToDateCurrentBurst: (r) => r.spendToDateCurrentBurst,
  spendYesterday: (r) => r.spendYesterday,
  spendPerDayRemaining: (r) => sortableNumber(r.spendPerDayRemaining),
  spendRemainingCurrentBurst: (r) => sortableNumber(r.spendRemainingCurrentBurst),
  spendToDateLineTotal: (r) => r.spendToDateLineTotal,
  spendRemainingLineTotal: (r) => sortableNumber(r.spendRemainingLineTotal),
  clicks: (r) => r.clicks,
  cpc: (r) => sortableNumber(r.cpc),
  ctr: (r) => sortableNumber(r.ctr),
  impressions: (r) => r.impressions,
  conversions: (r) => r.conversions,
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
 * Number of left-side columns that should be sticky on horizontal scroll.
 * Columns 0..STICKY_LEFT_COUNT-1 are sticky; STICKY_LEFT_COUNT onward scroll.
 *
 * Current ordering (after step 1):
 *   0: chevron
 *   1: Client
 *   2: Platform
 *   3: Campaign / Ad Group
 *   4: MBA
 *   5: Line Item ID
 *   6: Status
 *   7: Targeting
 */
const STICKY_LEFT_COUNT = 8;

const LINE_ITEM_BG = "hsl(210 20% 99%)";
const PLATFORM_CAMPAIGN_BG = "hsl(210 26% 95%)";
const AD_GROUP_BG = "hsl(210 22% 97%)";

const TARGETING_COLUMN_SHADOW = "2px 0 4px -2px rgba(0,0,0,0.08)";

/** Returns cumulative left offsets for sticky columns, in px. */
function computeLeftOffsets(widths: number[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (let i = 0; i < widths.length; i++) {
    offsets.push(running);
    running += widths[i];
  }
  return offsets;
}

/**
 * Measures the rendered widths of the first STICKY_LEFT_COUNT cells in the
 * first body row, returns cumulative left offsets, and re-measures on resize.
 */
function useStickyLeftOffsets(
  firstRowRef: RefObject<HTMLTableRowElement | null>
): number[] {
  const [offsets, setOffsets] = useState<number[]>(() =>
    new Array(STICKY_LEFT_COUNT).fill(0)
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
  background: string
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
  leftOffsets: number[]
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

function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return `${(n * 100).toFixed(2)}%`;
}

function fmtXanoDate(d: string | null): string {
  return d || XANO_MISSING;
}

function fmtXanoNumber(n: number | null): string {
  if (n === null) return XANO_MISSING;
  return new Intl.NumberFormat("en-AU").format(n);
}

export type LineItemPacingTableProps = {
  rows: SearchPacingCampaignRow[];
  isAdmin: boolean;
  onRowKpiTargetsUpdated: (lineItemId: string, targets: KpiTargets) => void;
};

export function LineItemPacingTable({
  rows,
  isAdmin,
  onRowKpiTargetsUpdated,
}: LineItemPacingTableProps) {
  const [expandedLineItems, setExpandedLineItems] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<PacingSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("asc");
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const leftOffsets = useStickyLeftOffsets(firstRowRef);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    const select = ROW_SORT_SELECTORS[sortColumn];
    return [...rows].sort((a, b) =>
      compareValues(select(a), select(b), sortDirection),
    );
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
        No live Search line items for today.
      </div>
    );
  }

  return (
    <div className="rounded border">
      <div className="relative max-h-[calc(100vh-220px)] overflow-auto">
        <table className="w-full min-w-[1400px] text-xs" style={{ borderSpacing: 0 }}>
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
                column="platform"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(2, leftOffsets)}
              />
              <SortablePacingTh
                label="Campaign / Ad Group"
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
                label="Burst End"
                column="burstEndDate"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Burst Days"
                column="burstDays"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Days Left"
                column="burstDaysRemaining"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Burst Budget"
                column="burstBudget"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Spend (Burst)"
                column="spendToDateCurrentBurst"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Spend Yesterday"
                column="spendYesterday"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Per-Day Left"
                column="spendPerDayRemaining"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Remaining (Burst)"
                column="spendRemainingCurrentBurst"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Spend (Line)"
                column="spendToDateLineTotal"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="Remaining (Line)"
                column="spendRemainingLineTotal"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
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
                label="CPC"
                column="cpc"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <SortablePacingTh
                label="CTR"
                column="ctr"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right border-b"
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
                label="Conversions"
                column="conversions"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggle={toggleSort}
                align="right"
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              />
              <th
                className="sticky top-0 bg-background p-2 text-right border-b"
                style={{ zIndex: 20 }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <FragmentForLineItem
                key={`${row.mbaNumber}-${row.lineItemId}-${row.xanoRowId}`}
                row={row}
                isExpanded={expandedLineItems.has(row.lineItemId)}
                onToggle={() => toggleLineItem(row.lineItemId)}
                expandedCampaigns={expandedCampaigns}
                onToggleCampaign={toggleCampaign}
                leftOffsets={leftOffsets}
                firstRowRef={rowIndex === 0 ? firstRowRef : undefined}
                isAdmin={isAdmin}
                onRowKpiTargetsUpdated={onRowKpiTargetsUpdated}
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
  isExpanded,
  onToggle,
  expandedCampaigns,
  onToggleCampaign,
  leftOffsets,
  firstRowRef,
  isAdmin,
  onRowKpiTargetsUpdated,
}: {
  row: SearchPacingCampaignRow;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCampaigns: Set<string>;
  onToggleCampaign: (key: string) => void;
  leftOffsets: number[];
  firstRowRef?: RefObject<HTMLTableRowElement | null>;
  isAdmin: boolean;
  onRowKpiTargetsUpdated: (lineItemId: string, targets: KpiTargets) => void;
}) {
  const hasChildren = row.platformCampaigns.length > 0;
  const clientSlug = slugifyClientName(row.clientName);

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
          {row.platform || XANO_MISSING}
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
            <KpiStatusPill status={computeRowKpiStatus(row)} />
            <KpiDrilldownButton
              row={row}
              isAdmin={isAdmin}
              onTargetsUpdated={(targets) => onRowKpiTargetsUpdated(row.lineItemId, targets)}
            />
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
        <td className="p-2 border-b">{row.currentBurst?.endDate ?? XANO_MISSING}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtXanoNumber(row.burstDays)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtXanoNumber(row.burstDaysRemaining)}</td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.currentBurst?.budget ?? null)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendToDateCurrentBurst)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">{fmtCurrencyOrZero(row.spendYesterday)}</td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendPerDayRemaining)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendRemainingCurrentBurst)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendToDateLineTotal)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendRemainingLineTotal)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.clicks)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtRatio(row.cpc)}</td>
        <td className={`p-2 border-b text-right tabular-nums ${ctrCellTint(row.ctr, row.kpiTargets?.ctr ?? null)}`}>
          {fmtPct(row.ctr)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.impressions)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.conversions)}</td>
        <td className="p-2 text-right border-b whitespace-nowrap">
          <div className="inline-flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" asChild>
              <Link
                href={`/mediaplans/mba/${encodeURIComponent(row.mbaNumber)}/edit`}
                onClick={(e) => e.stopPropagation()}
              >
                Edit
              </Link>
            </Button>
            {clientSlug ? (
              <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" asChild>
                <Link
                  href={`/dashboard/${encodeURIComponent(clientSlug)}/${encodeURIComponent(row.mbaNumber)}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  View
                </Link>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" disabled>
                View
              </Button>
            )}
          </div>
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
  row: SearchPacingCampaignRow;
  campaign: PlatformCampaignBreakdown;
  isExpanded: boolean;
  onToggle: () => void;
  leftOffsets: number[];
}) {
  const hasAdGroups = campaign.adGroups.length > 0;

  return (
    <Fragment>
      <tr
        className={`border-t ${hasAdGroups ? "cursor-pointer hover:bg-muted/25" : ""}`}
        style={{ background: PLATFORM_CAMPAIGN_BG }}
        onClick={hasAdGroups ? onToggle : undefined}
      >
        <td
          className="p-2 border-b pl-6"
          style={stickyLeftCellStyle(0, leftOffsets, PLATFORM_CAMPAIGN_BG)}
        >
          {hasAdGroups ? (
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
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(campaign.spendToDateCurrentBurst)}
        </td>
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(campaign.spendYesterday)}
        </td>
        <td className="p-2 border-b" />
        <td className="p-2 border-b" />
        <td className="p-2 border-b text-right tabular-nums">
          {fmtCurrencyOrZero(campaign.spendToDateLineTotal)}
        </td>
        <td className="p-2 border-b" />
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(campaign.clicks)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtRatio(campaign.cpc)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtPct(campaign.ctr)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(campaign.impressions)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(campaign.conversions)}</td>
        <td className="p-2 border-b" />
      </tr>

      {isExpanded &&
        campaign.adGroups.map((ag) => (
          <tr
            key={`${row.lineItemId}|${campaign.campaignId}|${ag.platformLineItemId}`}
            className="border-t"
            style={{ background: AD_GROUP_BG }}
          >
            <td
              className="p-2 border-b pl-10"
              style={stickyLeftCellStyle(0, leftOffsets, AD_GROUP_BG)}
            />
            <td className="p-2 border-b" style={stickyLeftCellStyle(1, leftOffsets, AD_GROUP_BG)} />
            <td className="p-2 border-b" style={stickyLeftCellStyle(2, leftOffsets, AD_GROUP_BG)} />
            <td
              className="p-2 border-b pl-4 text-muted-foreground"
              style={stickyLeftCellStyle(3, leftOffsets, AD_GROUP_BG)}
            >
              {ag.lineItemName || ag.platformLineItemId}
            </td>
            <td className="p-2 border-b" style={stickyLeftCellStyle(4, leftOffsets, AD_GROUP_BG)} />
            <td
              className="p-2 border-b font-mono text-[10px] text-muted-foreground"
              style={stickyLeftCellStyle(5, leftOffsets, AD_GROUP_BG)}
            >
              {ag.platformLineItemId}
            </td>
            <td className="p-2 border-b" style={stickyLeftCellStyle(6, leftOffsets, AD_GROUP_BG)} />
            <td className="p-2 border-b" style={stickyLeftCellStyle(7, leftOffsets, AD_GROUP_BG)} />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b text-right tabular-nums">
              {fmtCurrencyOrZero(ag.spendToDateCurrentBurst)}
            </td>
            <td className="p-2 border-b text-right tabular-nums">
              {fmtCurrencyOrZero(ag.spendYesterday)}
            </td>
            <td className="p-2 border-b" />
            <td className="p-2 border-b" />
            <td className="p-2 border-b text-right tabular-nums">
              {fmtCurrencyOrZero(ag.spendToDateLineTotal)}
            </td>
            <td className="p-2 border-b" />
            <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(ag.clicks)}</td>
            <td className="p-2 border-b text-right tabular-nums">{fmtRatio(ag.cpc)}</td>
            <td className="p-2 border-b text-right tabular-nums">{fmtPct(ag.ctr)}</td>
            <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(ag.impressions)}</td>
            <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(ag.conversions)}</td>
            <td className="p-2 border-b" />
          </tr>
        ))}
    </Fragment>
  );
}

function StatusCell({ status }: { status: SearchPacingCampaignRow["lineItemStatus"] }) {
  if (status === "no-data") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusBadge[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

function KpiStatusPill({ status }: { status: RowKpiStatus }) {
  const copy = copyForRowKpiStatus(status);
  const classes = (() => {
    switch (status) {
      case "kpi-pending":
        return "bg-muted text-muted-foreground";
      case "kpi-no-delivery":
        return "bg-muted text-muted-foreground";
      case "kpi-on-track":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
      case "kpi-mixed":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
      case "kpi-off-target":
        return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
    }
  })();
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${classes}`}
    >
      {copy}
    </span>
  );
}

function KpiDrilldownButton({
  row,
  isAdmin,
  onTargetsUpdated,
}: {
  row: SearchPacingCampaignRow;
  isAdmin: boolean;
  onTargetsUpdated: (targets: KpiTargets) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const comparisons = buildKpiComparisons(row);
  const hasTargets = row.kpiTargets !== null;
  const editorHref = `/mediaplans/mba/${encodeURIComponent(row.mbaNumber)}/edit`;

  const initialRow = useMemo(() => buildResolvedKpiRowFromPacing(row), [row]);

  const handleSave = useCallback(
    async (editedRow: ResolvedKPIRow) => {
      setIsSaving(true);
      try {
        const payload = buildSyncPayloadFromEditedRow(editedRow);
        const result = await syncCampaignKPIs([payload]);
        const synced = result[0];
        if (synced) {
          const newTargets = applySyncedTargetsToRow(synced);
          onTargetsUpdated(newTargets);
        }
        setIsModalOpen(false);
      } catch (err) {
        console.error("[pacing/kpi] sync failed", err);
      } finally {
        setIsSaving(false);
      }
    },
    [onTargetsUpdated],
  );

  const handleReset = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const host = useMemo(
    () =>
      createPacingKpiHost({
        initialRow,
        onSave: handleSave,
        onReset: handleReset,
        isSaving,
      }),
    [initialRow, handleSave, handleReset, isSaving],
  );

  return (
    <>
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
            editorHref={editorHref}
            isAdmin={isAdmin}
            onOpenModal={() => setIsModalOpen(true)}
          />
        </PopoverContent>
      </Popover>
      {isAdmin && (
        <KPIEditModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          host={host}
        />
      )}
    </>
  );
}

function KpiDrilldownContent({
  row,
  comparisons,
  hasTargets,
  editorHref,
  isAdmin,
  onOpenModal,
}: {
  row: SearchPacingCampaignRow;
  comparisons: KpiComparison[];
  hasTargets: boolean;
  editorHref: string;
  isAdmin: boolean;
  onOpenModal: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium">{row.lineItemId}</div>
        <div className="text-[10px] text-muted-foreground">{row.campaignName}</div>
      </div>

      {!hasTargets ? (
        isAdmin ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No KPI targets have been set for this line item yet.
            </p>
            <button
              type="button"
              className="inline-block rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal();
              }}
            >
              Create targets
            </button>
          </div>
        ) : (
          <EmptyKpiState editorHref={editorHref} />
        )
      ) : (
        <>
          <KpiComparisonTable comparisons={comparisons} />
          <div className="border-t pt-2">
            {isAdmin ? (
              <button
                type="button"
                className="text-[11px] text-blue-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenModal();
                }}
              >
                Edit targets
              </button>
            ) : (
              <a
                href={editorHref}
                className="text-[11px] text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Edit targets in media plan →
              </a>
            )}
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
        className="inline-block text-[11px] text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Set targets in media plan →
      </a>
    </div>
  );
}

function KpiComparisonTable({ comparisons }: { comparisons: KpiComparison[] }) {
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
          <KpiComparisonRow key={c.metric} comparison={c} />
        ))}
      </tbody>
    </table>
  );
}

function KpiComparisonRow({ comparison: c }: { comparison: KpiComparison }) {
  const varianceClass =
    c.variancePercent === null
      ? "text-muted-foreground"
      : c.variancePercent >= 0
        ? "text-emerald-700"
        : "text-rose-700";

  const actualDisplay =
    c.status === "no-target" ? (
      <span className="text-muted-foreground text-[10px]">Target not set</span>
    ) : c.status === "no-delivery" ? (
      <span className="text-muted-foreground text-[10px]">No delivery yet</span>
    ) : (
      formatRatioAsPercent(c.actual)
    );

  return (
    <tr>
      <td className="py-0.5 pr-2">{labelForMetric(c.metric)}</td>
      <td className="py-0.5 pr-2 text-right tabular-nums">
        {c.status === "no-target" ? "—" : formatRatioAsPercent(c.target)}
      </td>
      <td className="py-0.5 pr-2 text-right tabular-nums">{actualDisplay}</td>
      <td className={`py-0.5 text-right tabular-nums ${varianceClass}`}>
        {formatVariancePercent(c.variancePercent)}
      </td>
    </tr>
  );
}
