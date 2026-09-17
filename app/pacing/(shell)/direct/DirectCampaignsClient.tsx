"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { DirectCampaignGroup, DirectLineItemRow } from "@/lib/pacing/direct/types";
import { DirectCampaignsTable } from "@/components/pacing-direct/DirectCampaignsTable";
import { ChannelLayoutToggle } from "@/components/pacing/channel/ChannelLayoutToggle";
import { ChannelPacingBoard } from "@/components/pacing/channel/ChannelPacingBoard";
import {
  filterDirectCampaignGroups,
  isPacingClientFilterUnresolved,
} from "@/lib/pacing/filters/applyPacingRowFilters";
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore";
import {
  pacingFiltersActive,
  usePacingClientIdToNameMap,
} from "@/lib/pacing/usePacingClientIdToNameMap";
import {
  PacingClientFilterUnavailable,
  PacingFilterCount,
} from "@/components/pacing/PacingFilterResultMeta";
import { lineCardFromDirect } from "@/lib/pacing/channel/lineCardModel";
import { useChannelLayout } from "@/lib/pacing/channel/channelLayout";
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary";
import { LoadingState } from "@/components/ui/states";
import { resolveListViewState } from "@/lib/ui/viewState";
import { Switch } from "@/components/ui/switch";

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

type DirectBoardRow = { group: DirectCampaignGroup; line: DirectLineItemRow }

function regroupDirectRows(rows: DirectBoardRow[]): DirectCampaignGroup[] {
  const map = new Map<string, DirectCampaignGroup>()
  for (const { group, line } of rows) {
    const existing = map.get(group.mbaNumber)
    if (!existing) {
      map.set(group.mbaNumber, { ...group, lineItems: [line] })
    } else {
      existing.lineItems.push(line)
    }
  }
  return [...map.values()]
}

const EMPTY_CAMPAIGNS: DirectCampaignGroup[] = [];

export function DirectCampaignsClient({ isAdmin: _isAdmin }: DirectCampaignsClientProps) {
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [data, setData] = useState<ApiShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = usePacingFilterStore((s) => s.filters);
  const resetToDefaults = usePacingFilterStore((s) => s.resetToDefaults);
  const { layout } = useChannelLayout("direct");
  const { map: clientIdToName, settled: clientMapSettled } = usePacingClientIdToNameMap();

  const asOfDate = filters.as_of_date;
  const clientFilterPending = filters.client_ids.length > 0 && !clientMapSettled;
  const clientFilterUnresolved =
    clientMapSettled &&
    isPacingClientFilterUnresolved(filters.client_ids, clientIdToName);

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

  const asOf = data?.asOfDate ?? asOfDate;
  const boardItems = useMemo(
    () =>
      displayed.flatMap((group) =>
        group.lineItems.map((line) => ({
          model: lineCardFromDirect(group, line, asOf),
          row: { group, line },
        })),
      ),
    [displayed, asOf],
  );

  const deferredFilters = useDeferredValue(filters);
  const isFilterPending = filters !== deferredFilters;

  const filtersOn = pacingFiltersActive(filters);
  const sourceCampaigns = data?.campaigns ?? EMPTY_CAMPAIGNS;

  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading: (loading && !data) || clientFilterPending,
        error,
        items: sourceCampaigns,
        visible: displayed,
        filtersActive: filtersOn && !clientFilterUnresolved,
        clear: () => resetToDefaults(),
        retry: () => {
          load(includeHistorical);
        },
      }),
    [
      loading,
      data,
      error,
      sourceCampaigns,
      displayed,
      filtersOn,
      resetToDefaults,
      load,
      includeHistorical,
      clientFilterPending,
      clientFilterUnresolved,
    ],
  );

  const total = countLineItems(sourceCampaigns);
  const shown = countLineItems(displayed);

  return (
    <div className="space-y-4 p-4">
      <div className="text-sm text-muted-foreground">
        Fixed-cost media — reported spend vs platform actuals
      </div>
      {data ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-muted-foreground">As of {data.asOfDate}</div>
            {filtersOn &&
            !clientFilterPending &&
            !clientFilterUnresolved &&
            viewState.status === "ready" ? (
              <PacingFilterCount shown={shown} total={total} />
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {isFilterPending ? (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                Updating…
              </span>
            ) : loading ? (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                Refreshing…
              </span>
            ) : null}
            <ChannelLayoutToggle channel="direct" />
          </div>
        </div>
      ) : null}
      {/*
        Lives above the table, not inside it: with nothing in scope the table
        is replaced by an empty state, and the toggle that widens scope has to
        stay reachable.
      */}
      <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
        <Switch
          checked={includeHistorical}
          onCheckedChange={setIncludeHistorical}
          aria-label="Show historical fixed-cost line items"
        />
        Show historical (was ever fixed cost)
      </label>
      {clientFilterUnresolved ? (
        <PacingClientFilterUnavailable />
      ) : clientFilterPending && data ? (
        <LoadingState rows={4} />
      ) : (
        <ViewStateBoundary
          state={viewState}
          errorTitle="Failed to load direct pacing"
          emptyTitle="No direct campaigns"
          emptyMessage="No direct line items are in scope for this date."
          filteredEmptyTitle="No matching line items"
          filteredEmptyMessage="Clear filters to see all direct campaigns in scope."
          loadingRows={6}
        >
          {() =>
            data ? (
              <ChannelPacingBoard
                items={boardItems}
                asOf={data.asOfDate}
                channel="direct"
                layout={layout}
                renderTable={(rows) => (
                  <DirectCampaignsTable campaigns={regroupDirectRows(rows)} />
                )}
              />
            ) : null
          }
        </ViewStateBoundary>
      )}
    </div>
  );
}
