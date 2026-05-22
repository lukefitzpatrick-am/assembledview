"use client";

import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ChevronRight } from "lucide-react";
import { statusBadge, statusLabel } from "@/components/dashboard/delivery/shared/statusColours";
import type {
  PlatformCampaignBreakdown,
  SearchPacingCampaignRow,
} from "@/lib/pacing/campaigns/types";

const XANO_MISSING = "—";

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

export type LineItemPacingTableProps = { rows: SearchPacingCampaignRow[] };

export function LineItemPacingTable({ rows }: LineItemPacingTableProps) {
  const [expandedLineItems, setExpandedLineItems] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const leftOffsets = useStickyLeftOffsets(firstRowRef);

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
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(1, leftOffsets)}
              >
                Client
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(2, leftOffsets)}
              >
                Platform
              </th>
              <th
                className="sticky bg-background p-2 text-left border-b"
                style={stickyHeaderCornerStyle(3, leftOffsets)}
              >
                Campaign / Ad Group
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(4, leftOffsets)}
              >
                MBA
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(5, leftOffsets)}
              >
                Line Item ID
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={stickyHeaderCornerStyle(6, leftOffsets)}
              >
                Status
              </th>
              <th
                className="sticky bg-background p-2 text-left border-b"
                style={stickyHeaderCornerStyle(7, leftOffsets)}
              >
                Targeting
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Line Start
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Line End
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Total Budget
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Bursts
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Current
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Burst Start
              </th>
              <th
                className="sticky bg-background p-2 whitespace-nowrap text-left border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Burst End
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Burst Days
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Days Left
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Burst Budget
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Spend (Burst)
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Spend Yesterday
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Per-Day Left
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Remaining (Burst)
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Spend (Line)
              </th>
              <th
                className="sticky bg-background p-2 text-right whitespace-nowrap border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Remaining (Line)
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Clicks
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                CPC
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                CTR
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Impressions
              </th>
              <th
                className="sticky bg-background p-2 text-right border-b"
                style={{ top: 0, zIndex: 20 }}
              >
                Conversions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <FragmentForLineItem
                key={`${row.mbaNumber}-${row.lineItemId}-${row.xanoRowId}`}
                row={row}
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
  isExpanded,
  onToggle,
  expandedCampaigns,
  onToggleCampaign,
  leftOffsets,
  firstRowRef,
}: {
  row: SearchPacingCampaignRow;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCampaigns: Set<string>;
  onToggleCampaign: (key: string) => void;
  leftOffsets: number[];
  firstRowRef?: RefObject<HTMLTableRowElement | null>;
}) {
  const hasChildren = row.platformCampaigns.length > 0;

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
        <td className="p-2 border-b text-right tabular-nums">{fmtPct(row.ctr)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.impressions)}</td>
        <td className="p-2 border-b text-right tabular-nums">{fmtNumberOrZero(row.conversions)}</td>
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
