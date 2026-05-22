"use client";

import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";

const PART2_PLACEHOLDER = "—";

function fmtCurrency(n: number | null): string {
  if (n === null) return PART2_PLACEHOLDER;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function fmtNumber(n: number | null): string {
  if (n === null) return PART2_PLACEHOLDER;
  return new Intl.NumberFormat("en-AU").format(n);
}

export function SearchPacingCampaignTable({ rows }: { rows: SearchPacingCampaignRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
        No live Search line items for today.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="p-2">Client</th>
            <th className="p-2">Campaign</th>
            <th className="p-2">MBA</th>
            <th className="p-2">Line Item ID</th>
            <th className="p-2">Targeting</th>
            <th className="p-2">Line Start</th>
            <th className="p-2">Line End</th>
            <th className="p-2 text-right">Total Budget</th>
            <th className="p-2 text-right">Bursts</th>
            <th className="p-2 text-right">Current</th>
            <th className="p-2">Burst Start</th>
            <th className="p-2">Burst End</th>
            <th className="p-2 text-right">Burst Days</th>
            <th className="p-2 text-right">Days Left</th>
            <th className="p-2 text-right">Burst Budget</th>
            <th className="p-2 text-right">Spend (Burst)</th>
            <th className="p-2 text-right">Spend Yesterday</th>
            <th className="p-2 text-right">Per-Day Left</th>
            <th className="p-2 text-right">Remaining (Burst)</th>
            <th className="p-2 text-right">Spend (Line)</th>
            <th className="p-2 text-right">Remaining (Line)</th>
            <th className="p-2 text-right">Clicks</th>
            <th className="p-2 text-right">CPC</th>
            <th className="p-2 text-right">CTR</th>
            <th className="p-2 text-right">Impressions</th>
            <th className="p-2 text-right">Conversions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.mbaNumber}-${r.lineItemId}-${r.xanoRowId}`} className="border-t">
              <td className="p-2">{r.clientName}</td>
              <td className="p-2">{r.campaignName}</td>
              <td className="p-2 font-mono">{r.mbaNumber}</td>
              <td className="p-2 font-mono">{r.lineItemId}</td>
              <td className="p-2">{r.creativeTargeting || PART2_PLACEHOLDER}</td>
              <td className="p-2">{r.lineItemStartDate || PART2_PLACEHOLDER}</td>
              <td className="p-2">{r.lineItemEndDate || PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right">{fmtCurrency(r.totalLineItemBudget)}</td>
              <td className="p-2 text-right">{r.totalBursts}</td>
              <td className="p-2 text-right">
                {r.currentBurstIndex !== null ? r.currentBurstIndex + 1 : PART2_PLACEHOLDER}
              </td>
              <td className="p-2">{r.currentBurst?.startDate || PART2_PLACEHOLDER}</td>
              <td className="p-2">{r.currentBurst?.endDate || PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right">{fmtNumber(r.burstDays)}</td>
              <td className="p-2 text-right">{fmtNumber(r.burstDaysRemaining)}</td>
              <td className="p-2 text-right">{fmtCurrency(r.currentBurst?.budget ?? null)}</td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">
                {fmtCurrency(r.spendPerDayRemaining)}
              </td>
              <td className="p-2 text-right text-muted-foreground">
                {fmtCurrency(r.spendRemainingCurrentBurst)}
              </td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">
                {fmtCurrency(r.spendRemainingLineTotal)}
              </td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
              <td className="p-2 text-right text-muted-foreground">{PART2_PLACEHOLDER}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
