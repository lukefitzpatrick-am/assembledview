"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  compareValues,
  type SortDirection,
} from "@/components/ui/sortable-table-header";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MultiLineChart } from "@/components/charts/system";
import type {
  DirectBurstStatus,
  DirectCampaignGroup,
  DirectLineItemRow,
} from "@/lib/pacing/direct/types";
import { formatAUD } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const MISSING = "\u2014";

type SortColumn =
  | "clientName"
  | "campaignName"
  | "lineItemName"
  | "buyType"
  | "totalBudget"
  | "totalReported"
  | "totalActual"
  | "variance"
  | "lineItemStatus";

const NUMERIC = new Set<SortColumn>([
  "totalBudget",
  "totalReported",
  "totalActual",
  "variance",
]);

function fmtMoney(n: number): string {
  return formatAUD(n);
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return MISSING;
  return `${(n * 100).toFixed(1)}%`;
}

function statusLabel(status: DirectLineItemRow["lineItemStatus"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "completed_over":
      return "Completed over";
    case "completed_under":
      return "Completed under";
    case "mixed":
      return "Mixed";
  }
}

function statusBadgeVariant(
  status: DirectLineItemRow["lineItemStatus"]
): "secondary" | "on-track" | "ahead" | "behind" {
  switch (status) {
    case "in_progress":
      return "on-track";
    case "completed":
    case "completed_over":
      return "ahead";
    case "completed_under":
      return "behind";
    case "pending":
    case "mixed":
      return "secondary";
  }
}

function burstChipVariant(
  status: DirectBurstStatus
): "secondary" | "on-track" | "ahead" | "behind" {
  switch (status) {
    case "in_progress":
      return "on-track";
    case "completed":
    case "completed_over":
      return "ahead";
    case "completed_under":
      return "behind";
    case "pending":
      return "secondary";
  }
}

function varianceTone(variance: number): string {
  if (variance > 0) return "text-status-ahead-fg";
  if (variance < 0) return "text-status-behind-fg";
  return "text-muted-foreground";
}

type FlatRow = {
  group: DirectCampaignGroup;
  lineItem: DirectLineItemRow;
};

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

function DailyChart({ row }: { row: DirectLineItemRow }) {
  const hasExpected = row.daily.some((d) => d.expectedDailyDeliverables > 0);
  const chartData = useMemo(
    () =>
      row.daily.map((d) => ({
        date: d.dateDay.slice(5),
        reportedCumulative: d.reportedCumulative,
        actualCumulative: d.actualCumulative,
      })),
    [row.daily]
  );

  const squareupDays = row.daily.filter((d) => d.isSquareupDay).map((d) => d.dateDay);
  const lockedCount = row.daily.filter((d) => d.isLocked).length;
  const expectedTotal = row.daily.reduce((s, d) => s + d.expectedDailyDeliverables, 0);

  if (chartData.length === 0) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        No daily reported series for this line item
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <MultiLineChart
          data={chartData}
          xKey="date"
          series={[
            { key: "reportedCumulative", label: "Reported (cumulative)" },
            { key: "actualCumulative", label: "Actual platform (cumulative)" },
          ]}
          valueFormat="dollars"
          className="h-full w-full"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Reported = finance-smoothed spend from the fixed-cost proc; Actual = platform{" "}
        <span className="font-mono">AMOUNT_SPENT</span>. Days ≥3 calendar days old sit outside
        the rolling recalc window (proc <span className="font-mono">ROLLING_WINDOW_DAYS=3</span>
        ) — {lockedCount} day{lockedCount === 1 ? "" : "s"} treated as locked.
        {squareupDays.length > 0
          ? ` Square-up day${squareupDays.length === 1 ? "" : "s"}: ${squareupDays.join(", ")}.`
          : " No square-up days in this series."}
        {hasExpected
          ? ` Expected daily deliverables sum to ${expectedTotal.toLocaleString("en-AU")} (delivery-shaped buy).`
          : " Expected deliverables are 0 for buy_type=fixed_cost (linear reported accrual)."}
      </p>
    </div>
  );
}

function ExpandedDetail({ row }: { row: DirectLineItemRow }) {
  return (
    <div className="space-y-4 bg-surface-panel p-4">
      <div>
        <div className="mb-2 text-xs font-medium text-foreground">Bursts</div>
        {row.bursts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No burst rows</div>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-2 font-normal">#</th>
                  <th className="p-2 font-normal">Dates</th>
                  <th className="p-2 font-normal text-right">Budget</th>
                  <th className="p-2 font-normal text-right">Reported</th>
                  <th className="p-2 font-normal text-right">Actual</th>
                  <th className="p-2 font-normal text-right">Variance</th>
                  <th className="p-2 font-normal text-right">Delivery ratio</th>
                  <th className="p-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {row.bursts.map((b) => (
                  <tr key={b.burstIndex} className="border-t">
                    <td className="p-2 num">{b.burstIndex + 1}</td>
                    <td className="p-2 whitespace-nowrap">
                      {b.startDate} → {b.endDate}
                    </td>
                    <td className="p-2 text-right num">{fmtMoney(b.budget)}</td>
                    <td className="p-2 text-right num">{fmtMoney(b.reportedSpend)}</td>
                    <td className="p-2 text-right num">{fmtMoney(b.actualPlatformSpend)}</td>
                    <td className={cn("p-2 text-right num", varianceTone(b.variance))}>
                      {fmtMoney(b.variance)}
                    </td>
                    <td className="p-2 text-right num">
                      {b.expectedDeliverables > 0 ? b.deliveryRatio.toFixed(2) : MISSING}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={burstChipVariant(b.status)}
                        size="sm"
                        className="whitespace-nowrap text-[10px]"
                      >
                        {statusLabel(b.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-foreground">Daily reported series</div>
        <DailyChart row={row} />
      </div>
    </div>
  );
}

export function DirectCampaignsTable({
  campaigns,
  includeHistorical,
  onIncludeHistoricalChange,
}: {
  campaigns: DirectCampaignGroup[];
  includeHistorical: boolean;
  onIncludeHistoricalChange: (v: boolean) => void;
}) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>("clientName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const flat: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const group of campaigns) {
      for (const lineItem of group.lineItems) {
        rows.push({ group, lineItem });
      }
    }
    return rows;
  }, [campaigns]);

  const sorted = useMemo(() => {
    if (!sortColumn || !sortDirection) return flat;
    return [...flat].sort((a, b) => {
      const sel = (row: FlatRow): string | number | null => {
        switch (sortColumn) {
          case "clientName":
            return row.group.clientName;
          case "campaignName":
            return row.group.campaignName;
          case "lineItemName":
            return row.lineItem.lineItemName;
          case "buyType":
            return row.lineItem.buyType;
          case "totalBudget":
            return row.lineItem.totalBudget;
          case "totalReported":
            return row.lineItem.totalReported;
          case "totalActual":
            return row.lineItem.totalActual;
          case "variance":
            return row.lineItem.variance;
          case "lineItemStatus":
            return row.lineItem.lineItemStatus;
        }
      };
      return compareValues(sel(a), sel(b), sortDirection);
    });
  }, [flat, sortColumn, sortDirection]);

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(NUMERIC.has(column) ? "desc" : "asc");
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totals = useMemo(() => {
    return flat.reduce(
      (acc, r) => ({
        budget: acc.budget + r.lineItem.totalBudget,
        reported: acc.reported + r.lineItem.totalReported,
        actual: acc.actual + r.lineItem.totalActual,
      }),
      { budget: 0, reported: 0, actual: 0 }
    );
  }, [flat]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {flat.length} line item{flat.length === 1 ? "" : "s"} · Budget{" "}
          <span className="num text-foreground">{fmtMoney(totals.budget)}</span> · Reported{" "}
          <span className="num text-foreground">{fmtMoney(totals.reported)}</span> · Actual{" "}
          <span className="num text-foreground">{fmtMoney(totals.actual)}</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={includeHistorical}
            onCheckedChange={onIncludeHistoricalChange}
            aria-label="Show historical fixed-cost line items"
          />
          Show historical (was ever fixed cost)
        </label>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          No fixed-cost line items in scope
        </div>
      ) : (
        <div className="rounded border">
          <div className="relative max-h-[calc(100vh-260px)] overflow-auto">
            <table className="w-full min-w-[1200px] text-xs" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="text-left">
                  <th className="sticky top-0 z-20 bg-background border-b p-2 w-8" />
                  <SortTh
                    label="Client"
                    column="clientName"
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
                    label="Line item"
                    column="lineItemName"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                  />
                  <SortTh
                    label="Buy type"
                    column="buyType"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                  />
                  <SortTh
                    label="Budget"
                    column="totalBudget"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortTh
                    label="Reported"
                    column="totalReported"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortTh
                    label="Actual platform"
                    column="totalActual"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortTh
                    label="Variance"
                    column="variance"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <th className="sticky top-0 z-20 bg-background border-b p-2 whitespace-nowrap">
                    Bursts
                  </th>
                  <SortTh
                    label="Status"
                    column="lineItemStatus"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggle={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ group, lineItem }) => {
                  const key = `${group.mbaNumber}|${lineItem.lineItemId}`;
                  const isOpen = expanded.has(key);
                  const colSpan = 11;
                  return (
                    <Fragment key={key}>
                      <tr
                        className="border-t cursor-pointer hover:bg-muted/20"
                        onClick={() => toggleExpand(key)}
                      >
                        <td className="p-2 border-b">
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </td>
                        <td className="p-2 border-b font-medium">{group.clientName}</td>
                        <td className="p-2 border-b">{group.campaignName}</td>
                        <td className="p-2 border-b">
                          <div>{lineItem.lineItemName}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {lineItem.lineItemId}
                          </div>
                        </td>
                        <td className="p-2 border-b">{lineItem.buyType || MISSING}</td>
                        <td className="p-2 border-b text-right num">
                          {fmtMoney(lineItem.totalBudget)}
                        </td>
                        <td className="p-2 border-b text-right num">
                          {fmtMoney(lineItem.totalReported)}
                        </td>
                        <td className="p-2 border-b text-right num">
                          {fmtMoney(lineItem.totalActual)}
                        </td>
                        <td
                          className={cn(
                            "p-2 border-b text-right num",
                            varianceTone(lineItem.variance)
                          )}
                        >
                          <div>{fmtMoney(lineItem.variance)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {fmtPct(lineItem.variancePct)}
                          </div>
                        </td>
                        <td className="p-2 border-b">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="num text-muted-foreground">
                              {lineItem.burstCount}
                            </span>
                            {lineItem.burstsDeliveredOver > 0 ? (
                              <Badge
                                variant="ahead"
                                size="sm"
                                className="text-[10px]"
                              >
                                {lineItem.burstsDeliveredOver} over
                              </Badge>
                            ) : null}
                            {lineItem.burstsDeliveredUnder > 0 ? (
                              <Badge
                                variant="behind"
                                size="sm"
                                className="text-[10px]"
                              >
                                {lineItem.burstsDeliveredUnder} under
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2 border-b">
                          <Badge
                            variant={statusBadgeVariant(lineItem.lineItemStatus)}
                            size="sm"
                            className="whitespace-nowrap text-[10px]"
                          >
                            {statusLabel(lineItem.lineItemStatus)}
                          </Badge>
                          {!lineItem.isCurrentlyFixedCost ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              historical
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="border-t">
                          <td colSpan={colSpan} className="p-0">
                            <ExpandedDetail row={lineItem} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
