"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";
import { LineItemPacingTable } from "@/components/pacing-social/LineItemPacingTable";
import { applyPacingRowFilters } from "@/lib/pacing/filters/applyPacingRowFilters";
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore";
import {
  pacingFiltersActive,
  usePacingClientIdToNameMap,
} from "@/lib/pacing/usePacingClientIdToNameMap";
import {
  PacingFilterCount,
  PacingFilterEmptyState,
} from "@/components/pacing/PacingFilterResultMeta";
import { PacingStatusSummary } from "@/components/pacing/PacingStatusSummary";
import { countSocialOverviewStatus } from "@/lib/pacing/overview/countChannelOverviewStatus";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel";

type ApiShape = { asOfDate: string; rows: SocialPacingCampaignRow[] };

export type SocialCampaignsClientProps = {
  isAdmin: boolean;
};

export function SocialCampaignsClient({ isAdmin: _isAdmin }: SocialCampaignsClientProps) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = usePacingFilterStore((s) => s.filters);
  const clientIdToName = usePacingClientIdToNameMap();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ asOfDate: filters.as_of_date });
    fetch(`/api/pacing/social-campaigns?${qs}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as ApiShape;
        if (!cancelled) setData(json);
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
  }, [filters.as_of_date]);

  const displayed = useMemo(() => {
    if (!data) return [];
    return applyPacingRowFilters(
      data.rows,
      {
        client_ids: filters.client_ids,
        media_types: filters.media_types,
        statuses: filters.statuses,
        search: filters.search,
      },
      {
        clientName: (row) => row.clientName,
        mediaType: () => "social",
        status: (row) => row.lineItemStatus,
        searchText: (row) =>
          [
            row.clientName,
            row.campaignName,
            row.lineItemId,
            row.mbaNumber,
            row.creativeTargeting,
          ].join(" "),
      },
      clientIdToName,
    );
  }, [data, filters.client_ids, filters.media_types, filters.statuses, filters.search, clientIdToName]);

  const statusCounts = useMemo(
    () => countSocialOverviewStatus(displayed, data?.asOfDate ?? filters.as_of_date),
    [displayed, data?.asOfDate, filters.as_of_date],
  );

  const deferredFilters = useDeferredValue(filters);
  const isFilterPending = filters !== deferredFilters;

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <LoadingState rows={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <ErrorState title="Failed to load social pacing" message={error} />
      </div>
    );
  }
  if (!data) return null;

  const total = data.rows.length;
  const filtersOn = pacingFiltersActive(filters);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
          {filtersOn ? <PacingFilterCount shown={displayed.length} total={total} /> : null}
        </div>
        {isFilterPending ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Updating…
          </span>
        ) : null}
      </div>
      <PacingStatusSummary counts={statusCounts} />
      <Panel>
        <PanelHeader>
          <PanelTitle>Social campaigns</PanelTitle>
        </PanelHeader>
        <PanelContent>
          {filtersOn && displayed.length === 0 ? (
            <PacingFilterEmptyState />
          ) : total === 0 ? (
            <EmptyState
              title="No social campaigns"
              message="No social line items are in scope for this date."
            />
          ) : (
            <LineItemPacingTable rows={displayed} asOfDate={data.asOfDate} />
          )}
        </PanelContent>
      </Panel>
    </div>
  );
}
