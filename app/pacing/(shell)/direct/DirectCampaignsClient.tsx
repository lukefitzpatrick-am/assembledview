"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types";
import { DirectCampaignsTable } from "@/components/pacing-direct/DirectCampaignsTable";
import { filterDirectCampaignGroups } from "@/lib/pacing/filters/applyPacingRowFilters";
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
import { countDirectOverviewStatus } from "@/lib/pacing/overview/countChannelOverviewStatus";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel";

type ApiShape = {
  asOfDate: string;
  includeHistorical: boolean;
  campaigns: DirectCampaignGroup[];
};

export type DirectCampaignsClientProps = {
  isAdmin: boolean;
};

function countLineItems(campaigns: DirectCampaignGroup[]): number {
  return campaigns.reduce((n, g) => n + g.lineItems.length, 0);
}

export function DirectCampaignsClient({ isAdmin: _isAdmin }: DirectCampaignsClientProps) {
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = usePacingFilterStore((s) => s.filters);
  const clientIdToName = usePacingClientIdToNameMap();

  const asOfDate = filters.as_of_date;

  const load = useCallback(
    (historical: boolean) => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ asOfDate });
      if (historical) qs.set("includeHistorical", "1");
      fetch(`/api/pacing/direct-campaigns?${qs}`, { credentials: "include" })
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
    },
    [asOfDate],
  );

  useEffect(() => {
    return load(includeHistorical);
  }, [includeHistorical, load]);

  const displayed = useMemo(() => {
    if (!data) return [];
    return filterDirectCampaignGroups(
      data.campaigns,
      {
        client_ids: filters.client_ids,
        media_types: filters.media_types,
        statuses: filters.statuses,
        search: filters.search,
      },
      clientIdToName,
    );
  }, [data, filters.client_ids, filters.media_types, filters.statuses, filters.search, clientIdToName]);

  const statusCounts = useMemo(() => countDirectOverviewStatus(displayed), [displayed]);

  const deferredFilters = useDeferredValue(filters);
  const isFilterPending = filters !== deferredFilters;

  if (loading && !data) {
    return (
      <div className="space-y-4 p-4">
        <LoadingState rows={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <ErrorState title="Failed to load direct pacing" message={error} />
      </div>
    );
  }
  if (!data) return null;

  const total = countLineItems(data.campaigns);
  const shown = countLineItems(displayed);
  const filtersOn = pacingFiltersActive(filters);

  return (
    <div className="space-y-4 p-4">
      <div className="text-sm text-muted-foreground">
        Fixed-cost media — reported spend vs platform actuals
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
          {filtersOn ? <PacingFilterCount shown={shown} total={total} /> : null}
        </div>
        {isFilterPending || loading ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Updating…
          </span>
        ) : null}
      </div>
      <PacingStatusSummary counts={statusCounts} />
      <Panel>
        <PanelHeader>
          <PanelTitle>Direct campaigns</PanelTitle>
        </PanelHeader>
        <PanelContent>
          {filtersOn && shown === 0 ? (
            <PacingFilterEmptyState />
          ) : total === 0 ? (
            <EmptyState
              title="No direct campaigns"
              message="No direct line items are in scope for this date."
            />
          ) : (
            <DirectCampaignsTable
              campaigns={displayed}
              includeHistorical={includeHistorical}
              onIncludeHistoricalChange={setIncludeHistorical}
            />
          )}
        </PanelContent>
      </Panel>
    </div>
  );
}
