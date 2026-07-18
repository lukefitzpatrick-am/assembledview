"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  OverviewAttentionItem,
  OverviewChannel,
  OverviewPayload,
  OverviewStatusCounts,
} from "@/lib/pacing/overview/types";

export type OverviewClientProps = {
  isAdmin: boolean;
};

const CHANNEL_LABEL: Record<OverviewChannel, string> = {
  search: "Search",
  social: "Social",
  programmatic: "Programmatic",
  "ad-serving": "Ad Serving",
  direct: "Direct",
};

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

function buildOverviewUrl(page: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/api/pacing/overview?${qs}` : "/api/pacing/overview";
}

export function OverviewClient({ isAdmin: _isAdmin }: OverviewClientProps) {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const load = useCallback((nextPage: number) => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(buildOverviewUrl(nextPage), { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as OverviewPayload;
        if (!cancelled) {
          setData(json);
          setPage(json.scope?.page ?? nextPage);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return load(page);
    // Initial + page changes driven explicitly via load / buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page set from load response
  }, [load]);

  const goToPage = (nextPage: number) => {
    startTransition(() => {
      load(nextPage);
    });
  };

  if (loading && !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (error && !data) {
    return (
      <div className="p-6 text-sm text-destructive">Failed to load: {error}</div>
    );
  }
  if (!data) return null;

  const healthy =
    data.counts.onTrack + data.counts.ahead + data.counts.overPacing;
  const unavailable = data.unavailableSources ?? [];
  const available = data.availableSources ?? [];
  const scope = data.scope;

  return (
    <div className={`space-y-4 p-4 ${isPending ? "opacity-70" : ""}`}>
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Pacing overview</h1>
        <p className="text-xs text-muted-foreground">
          Line items across Search, Social, Programmatic, Ad Serving, and Direct
          in your scope. As of {data.asOfDate}. Channel tabs have full
          drill-down.
        </p>
      </header>

      {unavailable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-status-blocking-fg/30 bg-status-blocking-bg px-3 py-2">
          <span className="text-xs font-medium text-status-blocking-fg">
            Source unavailable
          </span>
          {unavailable.map((ch) => (
            <Badge key={ch} variant="critical" size="sm">
              {CHANNEL_LABEL[ch]} unavailable
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            Showing {available.map((ch) => CHANNEL_LABEL[ch]).join(", ") || "no"}{" "}
            data for this page.
          </span>
        </div>
      ) : null}

      {scope ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Clients {scope.clientSlugs.length} of {scope.totalClients}
            {scope.hasMore || scope.page > 1
              ? ` · page ${scope.page}`
              : null}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scope.page <= 1 || loading || isPending}
              onClick={() => goToPage(scope.page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!scope.hasMore || loading || isPending}
              onClick={() => goToPage(scope.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <StatusSummary counts={data.counts} />

      <AttentionSection
        title="Over-pacing — burning budget too fast"
        description="Projection ≥15% over expected spend. Act before the period overshoots."
        tone="critical"
        emptyLabel="No over-pacing burn warnings right now."
        items={data.overPacing}
      />

      <AttentionSection
        title="Underperforming"
        description="Behind on delivery or spend pace."
        tone="behind"
        emptyLabel={
          healthy > 0
            ? `No underperforming line items. ${healthy} active item${healthy === 1 ? "" : "s"} on track, ahead, or over-pacing.`
            : "No underperforming line items right now."
        }
        items={data.underperforming}
      />

      {data.aheadOnDelivery.length > 0 ? (
        <AttentionSection
          title="Ahead on delivery"
          description="Mildly ahead of projected spend (slightly over). Not the same as over-pacing burn."
          tone="ahead"
          emptyLabel=""
          items={data.aheadOnDelivery}
          collapsible
        />
      ) : null}
    </div>
  );
}

function StatusSummary({ counts }: { counts: OverviewStatusCounts }) {
  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: "Behind", value: counts.behind, tone: "text-status-behind-fg" },
    { label: "On track", value: counts.onTrack, tone: "text-status-on-track-fg" },
    { label: "Ahead", value: counts.ahead, tone: "text-status-ahead-fg" },
    {
      label: "Over-pacing",
      value: counts.overPacing,
      tone: "text-status-critical-fg",
    },
    { label: "No data", value: counts.noData, tone: "text-muted-foreground" },
    { label: "KPI Pending", value: counts.kpiPending, tone: "text-muted-foreground" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-card border border-border bg-card p-3 shadow-e0 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </span>
          <span className={`num text-lg font-semibold ${item.tone}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttentionSection({
  title,
  description,
  tone,
  emptyLabel,
  items,
  collapsible = false,
}: {
  title: string;
  description: string;
  tone: "critical" | "behind" | "ahead";
  emptyLabel: string;
  items: OverviewAttentionItem[];
  collapsible?: boolean;
}) {
  const shellTone =
    tone === "critical"
      ? "border-status-blocking-fg/30 bg-status-blocking-bg"
      : tone === "behind"
        ? "border-border bg-card"
        : "border-border bg-card";

  const badgeVariant =
    tone === "critical" ? "critical" : tone === "behind" ? "behind" : "ahead";

  if (items.length === 0) {
    return (
      <section className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </section>
    );
  }

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Channel</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Campaign</th>
            <th className="px-3 py-2 font-medium">MBA</th>
            <th className="px-3 py-2 font-medium">Line item</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium text-right">Budget</th>
            <th className="px-3 py-2 font-medium text-right">Spend</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="interactive-row border-b border-border last:border-0"
            >
              <td className="px-3 py-2">
                <Link
                  href={item.href}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {CHANNEL_LABEL[item.channel]}
                </Link>
              </td>
              <td className="px-3 py-2">{item.clientName}</td>
              <td className="px-3 py-2">{item.campaignName}</td>
              <td className="px-3 py-2 font-mono text-xs">{item.mbaNumber}</td>
              <td className="px-3 py-2 font-mono text-xs">{item.lineItemLabel}</td>
              <td className="px-3 py-2">
                <Badge variant={badgeVariant} size="sm">
                  {item.status === "over-pacing"
                    ? "Over-pacing"
                    : item.status === "behind"
                      ? "Behind"
                      : "Ahead"}
                </Badge>
              </td>
              <td className="num px-3 py-2 text-right">
                {formatMoney(item.budget)}
              </td>
              <td className="num px-3 py-2 text-right">
                {formatMoney(item.spendToDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (collapsible) {
    return (
      <details className={`rounded-card border ${shellTone} shadow-e0`}>
        <summary className="cursor-pointer px-4 py-3">
          <span className="text-sm font-semibold">{title}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            ({items.length}) — {description}
          </span>
        </summary>
        <div className="border-t border-border">{table}</div>
      </details>
    );
  }

  return (
    <section className={`rounded-card border ${shellTone} shadow-e0`}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {table}
    </section>
  );
}
