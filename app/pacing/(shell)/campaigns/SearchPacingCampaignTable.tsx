"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusBadge, statusLabel } from "@/components/dashboard/delivery/shared/statusColours";
import type {
  PlatformCampaignBreakdown,
  SearchPacingCampaignRow,
} from "@/lib/pacing/campaigns/types";

const XANO_MISSING = "—";

/** Cumulative left offsets for sticky columns 0–7 (colgroup widths). */
const STICKY_LEFT_OFFSETS = [0, 32, 152, 292, 492, 592, 732, 822];

const STICKY_TARGETING_SHADOW = "2px 0 4px -2px rgba(0,0,0,0.08)";

/** Solid row backgrounds (semi-transparent bg-muted/N bleeds under sticky cells). */
const ROW_BG_LINE = "hsl(var(--background))";
const ROW_BG_CAMPAIGN = "hsl(var(--muted))";
/** Between --background (210 20% 99%) and --muted (210 26% 95%). */
const ROW_BG_AD_GROUP = "hsl(210 22% 97%)";

type StickyBodyTier = "line" | "campaign" | "adgroup";

function stickyTargetingStyle(colIndex: number): Pick<CSSProperties, "boxShadow"> {
  return colIndex === 7 ? { boxShadow: STICKY_TARGETING_SHADOW } : {};
}

function stickyLeftHeaderProps(
  colIndex: number,
  className?: string
): { className: string; style: CSSProperties } {
  return {
    className: cn(
      "sticky top-0 z-30 bg-background p-2 text-left border-b",
      className
    ),
    style: {
      left: STICKY_LEFT_OFFSETS[colIndex],
      ...stickyTargetingStyle(colIndex),
    },
  };
}

function stickyScrollHeaderProps(className?: string): { className: string; style: CSSProperties } {
  return {
    className: cn("sticky top-0 z-20 bg-background p-2 text-left border-b", className),
    style: { top: 0 },
  };
}

function stickyLeftBodyProps(
  colIndex: number,
  tier: StickyBodyTier,
  className?: string
): { className: string; style: CSSProperties } {
  const background =
    tier === "line" ? ROW_BG_LINE : tier === "campaign" ? ROW_BG_CAMPAIGN : ROW_BG_AD_GROUP;
  return {
    className: cn("sticky z-10 p-2 border-b", className),
    style: {
      left: STICKY_LEFT_OFFSETS[colIndex],
      background,
      ...stickyTargetingStyle(colIndex),
    },
  };
}

function fmtCurrencyOrZero(n: number | null | undefined): string {
  if (n === null || n === undefined) return XANO_MISSING;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
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

export function SearchPacingCampaignTable({ rows }: { rows: SearchPacingCampaignRow[] }) {
  const [expandedLineItems, setExpandedLineItems] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

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
        <table
          className="w-full min-w-[1400px] border-separate text-xs"
          style={{ borderSpacing: 0 }}
        >
          <colgroup>
            <col style={{ width: "32px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "200px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "200px" }} />
          </colgroup>
          <thead>
            <tr className="text-left">
              <th {...stickyLeftHeaderProps(0)} />
              <th {...stickyLeftHeaderProps(1, "whitespace-nowrap")}>Client</th>
              <th {...stickyLeftHeaderProps(2, "whitespace-nowrap")}>Platform</th>
              <th {...stickyLeftHeaderProps(3)}>Campaign / Ad Group</th>
              <th {...stickyLeftHeaderProps(4, "whitespace-nowrap")}>MBA</th>
              <th {...stickyLeftHeaderProps(5, "whitespace-nowrap")}>Line Item ID</th>
              <th {...stickyLeftHeaderProps(6, "whitespace-nowrap")}>Status</th>
              <th {...stickyLeftHeaderProps(7)}>Targeting</th>
              <th {...stickyScrollHeaderProps("whitespace-nowrap")}>Line Start</th>
              <th {...stickyScrollHeaderProps("whitespace-nowrap")}>Line End</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Total Budget</th>
              <th {...stickyScrollHeaderProps("text-right")}>Bursts</th>
              <th {...stickyScrollHeaderProps("text-right")}>Current</th>
              <th {...stickyScrollHeaderProps("whitespace-nowrap")}>Burst Start</th>
              <th {...stickyScrollHeaderProps("whitespace-nowrap")}>Burst End</th>
              <th {...stickyScrollHeaderProps("text-right")}>Burst Days</th>
              <th {...stickyScrollHeaderProps("text-right")}>Days Left</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Burst Budget</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Spend (Burst)</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Spend Yesterday</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Per-Day Left</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Remaining (Burst)</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Spend (Line)</th>
              <th {...stickyScrollHeaderProps("text-right whitespace-nowrap")}>Remaining (Line)</th>
              <th {...stickyScrollHeaderProps("text-right")}>Clicks</th>
              <th {...stickyScrollHeaderProps("text-right")}>CPC</th>
              <th {...stickyScrollHeaderProps("text-right")}>CTR</th>
              <th {...stickyScrollHeaderProps("text-right")}>Impressions</th>
              <th {...stickyScrollHeaderProps("text-right")}>Conversions</th>
            </tr>
          </thead>
        <tbody>
          {rows.map((row) => (
            <FragmentForLineItem
              key={`${row.mbaNumber}-${row.lineItemId}-${row.xanoRowId}`}
              row={row}
              isExpanded={expandedLineItems.has(row.lineItemId)}
              onToggle={() => toggleLineItem(row.lineItemId)}
              expandedCampaigns={expandedCampaigns}
              onToggleCampaign={toggleCampaign}
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
}: {
  row: SearchPacingCampaignRow;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCampaigns: Set<string>;
  onToggleCampaign: (key: string) => void;
}) {
  const hasChildren = row.platformCampaigns.length > 0;

  return (
    <Fragment>
      <tr
        className={`border-t bg-background ${hasChildren ? "cursor-pointer hover:bg-muted/20" : ""} ${row.currentBurst === null ? "opacity-75" : ""}`}
        title={
          row.currentBurst === null
            ? "Live line item — no burst contains today (gap between bursts)"
            : undefined
        }
        onClick={hasChildren ? onToggle : undefined}
      >
        <td {...stickyLeftBodyProps(0, "line")}>
          {hasChildren ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td {...stickyLeftBodyProps(1, "line", "font-medium")}>{row.clientName}</td>
        <td {...stickyLeftBodyProps(2, "line")}>{row.platform || XANO_MISSING}</td>
        <td {...stickyLeftBodyProps(3, "line")}>{row.campaignName}</td>
        <td {...stickyLeftBodyProps(4, "line", "font-mono text-[10px]")}>{row.mbaNumber}</td>
        <td {...stickyLeftBodyProps(5, "line", "font-mono text-[10px]")}>{row.lineItemId}</td>
        <td {...stickyLeftBodyProps(6, "line")}>
          <StatusCell status={row.lineItemStatus} />
        </td>
        <td
          {...stickyLeftBodyProps(7, "line", "max-w-[8rem] truncate")}
          title={row.creativeTargeting}
        >
          {row.creativeTargeting || XANO_MISSING}
        </td>
        <td className="p-2">{fmtXanoDate(row.lineItemStartDate)}</td>
        <td className="p-2">{fmtXanoDate(row.lineItemEndDate)}</td>
        <td className="p-2 text-right tabular-nums">{fmtCurrencyOrZero(row.totalLineItemBudget)}</td>
        <td className="p-2 text-right tabular-nums">{row.totalBursts}</td>
        <td className="p-2 text-right tabular-nums">
          {row.currentBurstIndex !== null ? row.currentBurstIndex + 1 : XANO_MISSING}
        </td>
        <td className="p-2">{row.currentBurst?.startDate ?? XANO_MISSING}</td>
        <td className="p-2">{row.currentBurst?.endDate ?? XANO_MISSING}</td>
        <td className="p-2 text-right tabular-nums">{fmtXanoNumber(row.burstDays)}</td>
        <td className="p-2 text-right tabular-nums">{fmtXanoNumber(row.burstDaysRemaining)}</td>
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(row.currentBurst?.budget ?? null)}
        </td>
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendToDateCurrentBurst)}
        </td>
        <td className="p-2 text-right tabular-nums">{fmtCurrencyOrZero(row.spendYesterday)}</td>
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendPerDayRemaining)}
        </td>
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendRemainingCurrentBurst)}
        </td>
        <td className="p-2 text-right tabular-nums">{fmtCurrencyOrZero(row.spendToDateLineTotal)}</td>
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(row.spendRemainingLineTotal)}
        </td>
        <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(row.clicks)}</td>
        <td className="p-2 text-right tabular-nums">{fmtRatio(row.cpc)}</td>
        <td className="p-2 text-right tabular-nums">{fmtPct(row.ctr)}</td>
        <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(row.impressions)}</td>
        <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(row.conversions)}</td>
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
}: {
  row: SearchPacingCampaignRow;
  campaign: PlatformCampaignBreakdown;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasAdGroups = campaign.adGroups.length > 0;

  return (
    <Fragment>
      <tr
        className={`border-t bg-muted ${hasAdGroups ? "cursor-pointer hover:bg-muted/25" : ""}`}
        onClick={hasAdGroups ? onToggle : undefined}
      >
        <td {...stickyLeftBodyProps(0, "campaign", "pl-6")}>
          {hasAdGroups ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td {...stickyLeftBodyProps(1, "campaign")} />
        <td {...stickyLeftBodyProps(2, "campaign")} />
        <td {...stickyLeftBodyProps(3, "campaign", "italic text-foreground/90")}>
          {campaign.campaignName || campaign.campaignId}
        </td>
        <td {...stickyLeftBodyProps(4, "campaign")} />
        <td {...stickyLeftBodyProps(5, "campaign")} />
        <td {...stickyLeftBodyProps(6, "campaign")} />
        <td {...stickyLeftBodyProps(7, "campaign")} />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(campaign.spendToDateCurrentBurst)}
        </td>
        <td className="p-2 text-right tabular-nums">{fmtCurrencyOrZero(campaign.spendYesterday)}</td>
        <td className="p-2" />
        <td className="p-2" />
        <td className="p-2 text-right tabular-nums">
          {fmtCurrencyOrZero(campaign.spendToDateLineTotal)}
        </td>
        <td className="p-2" />
        <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(campaign.clicks)}</td>
        <td className="p-2 text-right tabular-nums">{fmtRatio(campaign.cpc)}</td>
        <td className="p-2 text-right tabular-nums">{fmtPct(campaign.ctr)}</td>
        <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(campaign.impressions)}</td>
        <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(campaign.conversions)}</td>
      </tr>

      {isExpanded &&
        campaign.adGroups.map((ag) => (
          <tr
            key={`${row.lineItemId}|${campaign.campaignId}|${ag.platformLineItemId}`}
            className="border-t bg-[hsl(210_22%_97%)]"
          >
            <td {...stickyLeftBodyProps(0, "adgroup", "pl-10")} />
            <td {...stickyLeftBodyProps(1, "adgroup")} />
            <td {...stickyLeftBodyProps(2, "adgroup")} />
            <td {...stickyLeftBodyProps(3, "adgroup", "pl-4 text-muted-foreground")}>
              {ag.lineItemName || ag.platformLineItemId}
            </td>
            <td {...stickyLeftBodyProps(4, "adgroup")} />
            <td {...stickyLeftBodyProps(5, "adgroup", "font-mono text-[10px] text-muted-foreground")}>
              {ag.platformLineItemId}
            </td>
            <td {...stickyLeftBodyProps(6, "adgroup")} />
            <td {...stickyLeftBodyProps(7, "adgroup")} />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2 text-right tabular-nums">
              {fmtCurrencyOrZero(ag.spendToDateCurrentBurst)}
            </td>
            <td className="p-2 text-right tabular-nums">{fmtCurrencyOrZero(ag.spendYesterday)}</td>
            <td className="p-2" />
            <td className="p-2" />
            <td className="p-2 text-right tabular-nums">{fmtCurrencyOrZero(ag.spendToDateLineTotal)}</td>
            <td className="p-2" />
            <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(ag.clicks)}</td>
            <td className="p-2 text-right tabular-nums">{fmtRatio(ag.cpc)}</td>
            <td className="p-2 text-right tabular-nums">{fmtPct(ag.ctr)}</td>
            <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(ag.impressions)}</td>
            <td className="p-2 text-right tabular-nums">{fmtNumberOrZero(ag.conversions)}</td>
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
