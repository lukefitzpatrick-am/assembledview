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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { slugifyClientName } from "@/lib/api/dashboard/shared";
import {
  buildKpiComparisons,
  computeRowKpiStatus,
  type KpiComparison,
  type RowKpiStatus,
} from "@/lib/pacing/kpi/computeKpiStatus";
import { kpiStatusPresentation, pacingStatusFromBand } from "@/lib/pacing/status";
import { PACING_TABLE_SCROLL_CLASSNAME } from "@/components/pacing/pacingTableScroll";
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
import { formatAUD, formatMoney } from "@/lib/format/money";
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
  "platform",
  "mbaNumber",
  "lineItemId",
  "creativeTargeting",
  "lineItemStartDate",
  "lineItemEndDate",
  "totalBursts",
  "currentBurstIndex",
  "burstStartDate",
  "burstEndDate",
  "burstDays",
  "burstDaysRemaining",
  "burstBudget",
  "spendToDateCurrentBurst",
  "spendYesterday",
  "spendPerDayRemaining",
  "spendRemainingCurrentBurst",
  "spendRemainingLineTotal",
  "clicks",
  "cpc",
  "ctr",
  "impressions",
  "conversions",
];

/** Default columns always render; optional only when "More columns" is on; unclassified never render. */
function isColumnVisible(column: PacingSortColumn, moreColumns: boolean): boolean {
  if (DEFAULT_COLUMNS.includes(column)) return true;
  if (OPTIONAL_COLUMNS.includes(column)) return moreColumns;
  return false;
}

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
  /** Column meaning for native tooltip. */
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
 * (including the expand chevron) scrolls normally. Campaign's offset is the
 * measured width of the Client column; intervening non-sticky columns (e.g.
 * Platform, shown via "More columns") simply scroll underneath.
 */
const STICKY_EDGE_SHADOW = "-1px 0 0 hsl(var(--border)) inset";

const LINE_ITEM_BG_CLASS = "bg-card";
const PLATFORM_CAMPAIGN_BG_CLASS = "bg-surface-panel";
const AD_GROUP_BG_CLASS = "bg-[var(--fill-track)]";


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

function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return formatMoney(n);
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
  const [moreColumns, setMoreColumns] = useState(false);
  const clientCellRef = useRef<HTMLTableCellElement>(null);
  const clientWidth = useClientColumnWidth(clientCellRef);

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
            className={cn("w-full text-xs", moreColumns ? "min-w-[1400px]" : "min-w-[860px]")}
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
                {isColumnVisible("platform", moreColumns) && (
                  <SortablePacingTh
                    label="Platform"
                    column="platform"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky top-0 z-20 bg-background p-2 whitespace-nowrap text-left border-b"
                  />
                )}
                <SortablePacingTh
                  label="Campaign / Ad Group"
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
                {isColumnVisible("burstEndDate", moreColumns) && (
                  <SortablePacingTh
                    label="Burst End"
                    column="burstEndDate"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                    style={{ top: 0, zIndex: 20 }}
                  />
                )}
                {isColumnVisible("burstDays", moreColumns) && (
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
                )}
                {isColumnVisible("burstDaysRemaining", moreColumns) && (
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
                )}
                {isColumnVisible("burstBudget", moreColumns) && (
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
                )}
                {isColumnVisible("spendToDateCurrentBurst", moreColumns) && (
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
                )}
                {isColumnVisible("spendYesterday", moreColumns) && (
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
                )}
                {isColumnVisible("spendPerDayRemaining", moreColumns) && (
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
                )}
                {isColumnVisible("spendRemainingCurrentBurst", moreColumns) && (
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
                {isColumnVisible("spendRemainingLineTotal", moreColumns) && (
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
                {isColumnVisible("cpc", moreColumns) && (
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
                )}
                {isColumnVisible("ctr", moreColumns) && (
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
                )}
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
                {isColumnVisible("conversions", moreColumns) && (
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
                )}
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
                  clientWidth={clientWidth}
                  clientCellRef={rowIndex === 0 ? clientCellRef : undefined}
                  isAdmin={isAdmin}
                  onRowKpiTargetsUpdated={onRowKpiTargetsUpdated}
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
  isExpanded,
  onToggle,
  expandedCampaigns,
  onToggleCampaign,
  clientWidth,
  clientCellRef,
  isAdmin,
  onRowKpiTargetsUpdated,
  moreColumns,
}: {
  row: SearchPacingCampaignRow;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCampaigns: Set<string>;
  onToggleCampaign: (key: string) => void;
  clientWidth: number;
  clientCellRef?: RefObject<HTMLTableCellElement | null>;
  isAdmin: boolean;
  onRowKpiTargetsUpdated: (lineItemId: string, targets: KpiTargets) => void;
  moreColumns: boolean;
}) {
  const hasChildren = row.platformCampaigns.length > 0;
  const clientSlug = slugifyClientName(row.clientName);

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
        {isColumnVisible("platform", moreColumns) && (
          <td className="p-2">{row.platform || XANO_MISSING}</td>
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
            <KpiStatusPill status={computeRowKpiStatus(row)} />
            <KpiDrilldownButton
              row={row}
              isAdmin={isAdmin}
              onTargetsUpdated={(targets) => onRowKpiTargetsUpdated(row.lineItemId, targets)}
            />
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
        {isColumnVisible("burstEndDate", moreColumns) && (
          <td className="p-2">{row.currentBurst?.endDate ?? XANO_MISSING}</td>
        )}
        {isColumnVisible("burstDays", moreColumns) && (
          <td className="p-2 text-right num">{fmtXanoNumber(row.burstDays)}</td>
        )}
        {isColumnVisible("burstDaysRemaining", moreColumns) && (
          <td className="p-2 text-right num">{fmtXanoNumber(row.burstDaysRemaining)}</td>
        )}
        {isColumnVisible("burstBudget", moreColumns) && (
          <td className="p-2 text-right num">
            {fmtCurrencyOrZero(row.currentBurst?.budget ?? null)}
          </td>
        )}
        {isColumnVisible("spendToDateCurrentBurst", moreColumns) && (
          <td className="p-2 text-right num">
            {fmtCurrencyOrZero(row.spendToDateCurrentBurst)}
          </td>
        )}
        {isColumnVisible("spendYesterday", moreColumns) && (
          <td className="p-2 text-right num">{fmtCurrencyOrZero(row.spendYesterday)}</td>
        )}
        {isColumnVisible("spendPerDayRemaining", moreColumns) && (
          <td className="p-2 text-right num">
            {fmtCurrencyOrZero(row.spendPerDayRemaining)}
          </td>
        )}
        {isColumnVisible("spendRemainingCurrentBurst", moreColumns) && (
          <td className="p-2 text-right num">
            {fmtCurrencyOrZero(row.spendRemainingCurrentBurst)}
          </td>
        )}
        <td className="p-2 text-right num">{fmtCurrencyOrZero(row.spendToDateLineTotal)}</td>
        {isColumnVisible("spendRemainingLineTotal", moreColumns) && (
          <td className="p-2 text-right num">
            {fmtCurrencyOrZero(row.spendRemainingLineTotal)}
          </td>
        )}
        {isColumnVisible("clicks", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(row.clicks)}</td>
        )}
        {isColumnVisible("cpc", moreColumns) && (
          <td className="p-2 text-right num">{fmtRatio(row.cpc)}</td>
        )}
        {isColumnVisible("ctr", moreColumns) && (
          <td className={`p-2 text-right num ${ctrCellTint(row.ctr, row.kpiTargets?.ctr ?? null)}`}>
            {fmtPct(row.ctr)}
          </td>
        )}
        {isColumnVisible("impressions", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(row.impressions)}</td>
        )}
        {isColumnVisible("conversions", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(row.conversions)}</td>
        )}
        <td className="p-2 text-right whitespace-nowrap">
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
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled
                title="Client slug missing — cannot open the client dashboard"
              >
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
  row: SearchPacingCampaignRow;
  campaign: PlatformCampaignBreakdown;
  isExpanded: boolean;
  onToggle: () => void;
  clientWidth: number;
  moreColumns: boolean;
}) {
  const hasAdGroups = campaign.adGroups.length > 0;

  return (
    <Fragment>
      <tr
        className={cn(
          "border-t",
          PLATFORM_CAMPAIGN_BG_CLASS,
          hasAdGroups && "cursor-pointer hover:bg-muted/25",
        )}
        onClick={hasAdGroups ? onToggle : undefined}
      >
        <td className="p-2 pl-6">
          {hasAdGroups ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td className={cn("p-2", PLATFORM_CAMPAIGN_BG_CLASS)} style={stickyClientCellStyle()} />
        {isColumnVisible("platform", moreColumns) && <td className="p-2" />}
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
        {isColumnVisible("burstEndDate", moreColumns) && <td className="p-2" />}
        {isColumnVisible("burstDays", moreColumns) && <td className="p-2" />}
        {isColumnVisible("burstDaysRemaining", moreColumns) && <td className="p-2" />}
        {isColumnVisible("burstBudget", moreColumns) && <td className="p-2" />}
        {isColumnVisible("spendToDateCurrentBurst", moreColumns) && (
          <td className="p-2 text-right num">
            {fmtCurrencyOrZero(campaign.spendToDateCurrentBurst)}
          </td>
        )}
        {isColumnVisible("spendYesterday", moreColumns) && (
          <td className="p-2 text-right num">{fmtCurrencyOrZero(campaign.spendYesterday)}</td>
        )}
        {isColumnVisible("spendPerDayRemaining", moreColumns) && <td className="p-2" />}
        {isColumnVisible("spendRemainingCurrentBurst", moreColumns) && <td className="p-2" />}
        <td className="p-2 text-right num">{fmtCurrencyOrZero(campaign.spendToDateLineTotal)}</td>
        {isColumnVisible("spendRemainingLineTotal", moreColumns) && <td className="p-2" />}
        {isColumnVisible("clicks", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(campaign.clicks)}</td>
        )}
        {isColumnVisible("cpc", moreColumns) && (
          <td className="p-2 text-right num">{fmtRatio(campaign.cpc)}</td>
        )}
        {isColumnVisible("ctr", moreColumns) && (
          <td className="p-2 text-right num">{fmtPct(campaign.ctr)}</td>
        )}
        {isColumnVisible("impressions", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(campaign.impressions)}</td>
        )}
        {isColumnVisible("conversions", moreColumns) && (
          <td className="p-2 text-right num">{fmtNumberOrZero(campaign.conversions)}</td>
        )}
        <td className="p-2" />
      </tr>

      {isExpanded &&
        campaign.adGroups.map((ag) => (
          <tr
            key={`${row.lineItemId}|${campaign.campaignId}|${ag.platformLineItemId}`}
            className={cn("border-t", AD_GROUP_BG_CLASS)}
          >
            <td className="p-2 pl-10" />
            <td className={cn("p-2", AD_GROUP_BG_CLASS)} style={stickyClientCellStyle()} />
            {isColumnVisible("platform", moreColumns) && <td className="p-2" />}
            <td
              className={cn("p-2 pl-4 text-muted-foreground", AD_GROUP_BG_CLASS)}
              style={stickyCampaignCellStyle(clientWidth)}
            >
              {ag.lineItemName || ag.platformLineItemId}
            </td>
            {isColumnVisible("mbaNumber", moreColumns) && <td className="p-2" />}
            {isColumnVisible("lineItemId", moreColumns) && (
              <td className="p-2 font-mono text-[10px] text-muted-foreground">
                {ag.platformLineItemId}
              </td>
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
            {isColumnVisible("burstEndDate", moreColumns) && <td className="p-2" />}
            {isColumnVisible("burstDays", moreColumns) && <td className="p-2" />}
            {isColumnVisible("burstDaysRemaining", moreColumns) && <td className="p-2" />}
            {isColumnVisible("burstBudget", moreColumns) && <td className="p-2" />}
            {isColumnVisible("spendToDateCurrentBurst", moreColumns) && (
              <td className="p-2 text-right num">
                {fmtCurrencyOrZero(ag.spendToDateCurrentBurst)}
              </td>
            )}
            {isColumnVisible("spendYesterday", moreColumns) && (
              <td className="p-2 text-right num">{fmtCurrencyOrZero(ag.spendYesterday)}</td>
            )}
            {isColumnVisible("spendPerDayRemaining", moreColumns) && <td className="p-2" />}
            {isColumnVisible("spendRemainingCurrentBurst", moreColumns) && <td className="p-2" />}
            <td className="p-2 text-right num">{fmtCurrencyOrZero(ag.spendToDateLineTotal)}</td>
            {isColumnVisible("spendRemainingLineTotal", moreColumns) && <td className="p-2" />}
            {isColumnVisible("clicks", moreColumns) && (
              <td className="p-2 text-right num">{fmtNumberOrZero(ag.clicks)}</td>
            )}
            {isColumnVisible("cpc", moreColumns) && (
              <td className="p-2 text-right num">{fmtRatio(ag.cpc)}</td>
            )}
            {isColumnVisible("ctr", moreColumns) && (
              <td className="p-2 text-right num">{fmtPct(ag.ctr)}</td>
            )}
            {isColumnVisible("impressions", moreColumns) && (
              <td className="p-2 text-right num">{fmtNumberOrZero(ag.impressions)}</td>
            )}
            {isColumnVisible("conversions", moreColumns) && (
              <td className="p-2 text-right num">{fmtNumberOrZero(ag.conversions)}</td>
            )}
            <td className="p-2" />
          </tr>
        ))}
    </Fragment>
  );
}

function StatusCell({ status }: { status: SearchPacingCampaignRow["lineItemStatus"] }) {
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
                className="text-[11px] text-primary hover:text-primary/80 hover:underline"
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
                className="text-[11px] text-primary hover:text-primary/80 hover:underline"
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
        className="inline-block text-[11px] text-primary hover:text-primary/80 hover:underline"
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
        ? "text-status-ahead-fg"
        : "text-status-critical-fg";

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
      <td className="num py-0.5 pr-2 text-right">
        {c.status === "no-target" ? "—" : formatRatioAsPercent(c.target)}
      </td>
      <td className="num py-0.5 pr-2 text-right">{actualDisplay}</td>
      <td className={`num py-0.5 text-right ${varianceClass}`}>
        {formatVariancePercent(c.variancePercent)}
      </td>
    </tr>
  );
}
