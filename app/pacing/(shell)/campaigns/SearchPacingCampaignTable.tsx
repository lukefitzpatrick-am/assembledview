"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { statusBadge, statusLabel } from "@/components/dashboard/delivery/shared/statusColours";
import type {
  PlatformCampaignBreakdown,
  SearchPacingCampaignRow,
} from "@/lib/pacing/campaigns/types";

const XANO_MISSING = "—";

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
    <div className="overflow-auto rounded border max-h-[calc(100vh-12rem)]">
      <table className="w-full min-w-[1400px] text-xs">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <tr className="text-left">
            <th className="w-8 p-2" />
            <th className="p-2 whitespace-nowrap">Client</th>
            <th className="p-2 min-w-[10rem]">Campaign / Ad Group</th>
            <th className="p-2 whitespace-nowrap">MBA</th>
            <th className="p-2 whitespace-nowrap">Line Item ID</th>
            <th className="p-2 whitespace-nowrap">Status</th>
            <th className="p-2">Targeting</th>
            <th className="p-2 whitespace-nowrap">Line Start</th>
            <th className="p-2 whitespace-nowrap">Line End</th>
            <th className="p-2 text-right whitespace-nowrap">Total Budget</th>
            <th className="p-2 text-right">Bursts</th>
            <th className="p-2 text-right">Current</th>
            <th className="p-2 whitespace-nowrap">Burst Start</th>
            <th className="p-2 whitespace-nowrap">Burst End</th>
            <th className="p-2 text-right">Burst Days</th>
            <th className="p-2 text-right">Days Left</th>
            <th className="p-2 text-right whitespace-nowrap">Burst Budget</th>
            <th className="p-2 text-right whitespace-nowrap">Spend (Burst)</th>
            <th className="p-2 text-right whitespace-nowrap">Spend Yesterday</th>
            <th className="p-2 text-right whitespace-nowrap">Per-Day Left</th>
            <th className="p-2 text-right whitespace-nowrap">Remaining (Burst)</th>
            <th className="p-2 text-right whitespace-nowrap">Spend (Line)</th>
            <th className="p-2 text-right whitespace-nowrap">Remaining (Line)</th>
            <th className="p-2 text-right">Clicks</th>
            <th className="p-2 text-right">CPC</th>
            <th className="p-2 text-right">CTR</th>
            <th className="p-2 text-right">Impressions</th>
            <th className="p-2 text-right">Conversions</th>
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
        className={`border-t ${hasChildren ? "cursor-pointer hover:bg-muted/20" : ""} ${row.currentBurst === null ? "opacity-75" : ""}`}
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
        <td className="p-2 font-medium">{row.clientName}</td>
        <td className="p-2">{row.campaignName}</td>
        <td className="p-2 font-mono text-[10px]">{row.mbaNumber}</td>
        <td className="p-2 font-mono text-[10px]">{row.lineItemId}</td>
        <td className="p-2">
          <StatusCell status={row.lineItemStatus} />
        </td>
        <td className="p-2 max-w-[8rem] truncate" title={row.creativeTargeting}>
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
        className={`border-t bg-muted/10 ${hasAdGroups ? "cursor-pointer hover:bg-muted/25" : ""}`}
        onClick={hasAdGroups ? onToggle : undefined}
      >
        <td className="p-2 pl-6">
          {hasAdGroups ? (
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td className="p-2" />
        <td className="p-2 italic text-foreground/90">{campaign.campaignName || campaign.campaignId}</td>
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
            className="border-t bg-muted/5"
          >
            <td className="p-2 pl-10" />
            <td className="p-2" />
            <td className="p-2 pl-4 text-muted-foreground">{ag.lineItemName || ag.platformLineItemId}</td>
            <td className="p-2" />
            <td className="p-2 font-mono text-[10px] text-muted-foreground">{ag.platformLineItemId}</td>
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
