"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import {
  allocate,
  computeBcs,
  effectiveCpm,
  totalAttention,
  totalBcs,
  totalReach,
} from "../lib/bcs-engine";
import { STATE_TO_GEO } from "../lib/data";
import { rangeFromBands } from "../lib/ageBands";
import type { Channel, GeoId, PlannerInputs } from "../lib/types";
import type { FormState } from "./PlannerForm";
import type { AdapterResult } from "@/lib/planning/adapter";

import { MetricCards } from "./MetricCards";
import { ChannelMixTable } from "./ChannelMixTable";
import { CulturalMomentsList } from "./CulturalMomentsList";
import { AvaNarration } from "./AvaNarration";
import { ReachProfile } from "./ReachProfile";

interface ResultsPanelProps {
  state: FormState;
  adapted: AdapterResult | null;
  loading: boolean;
  error: string | null;
}

function toEngineInputs(state: FormState): PlannerInputs {
  const [ageMin, ageMax] = rangeFromBands(state.ageBands);
  const geos: GeoId[] = state.states.map((s) => STATE_TO_GEO[s] ?? "au");
  return {
    objective: state.objective,
    segments: state.segmentId ? [state.segmentId] : [],
    weights: state.weights,
    flight: state.flight,
    budget: state.budget,
    ageMin,
    ageMax: ageMax >= 75 ? 66 : ageMax,
    gender: state.gender,
    geos: geos.length > 0 ? geos : ["au"],
  };
}

function toChannels(adapted: AdapterResult): Channel[] {
  return adapted.channels.map((c) => ({
    id: c.id,
    name: c.name,
    attn: c.attn,
    B: c.B,
    D: c.D,
    cpm: c.cpm,
    color: c.color,
    aff: c.aff,
    ageMod: c.ageMod,
    genderMod: c.genderMod,
    reachPct: c.reachPct,
    isRmMeasured: c.isRmMeasured,
    ageBase: c.ageBase,
  }));
}

export function ResultsPanel({ state, adapted, loading, error }: ResultsPanelProps) {
  const show18Base = state.ageBands.includes("14-24");

  const computation = useMemo(() => {
    if (!adapted) return null;
    const inputs = toEngineInputs(state);
    const channels = toChannels(adapted);
    const scored = computeBcs(inputs, channels);
    const allocated = allocate(scored, inputs.budget);
    return {
      inputs,
      scored,
      allocated,
      total: totalBcs(allocated),
      reach: totalReach(allocated),
      attn: totalAttention(allocated),
      cpm: effectiveCpm(allocated),
      audience: adapted.audienceWc,
    };
  }, [state, adapted]);

  const handleStressTest = () => {
    if (!computation) return;
    console.log("[BCP action] stress_test", {
      currentBudget: state.budget,
      proposedBudget: Math.round(state.budget * 0.7),
      currentMix: computation.allocated.map((a) => ({
        ch: a.ch.id,
        pct: Math.round(a.pct),
      })),
    });
  };

  const handleExplainTop = () => {
    if (!computation) return;
    const top = computation.allocated[0];
    if (!top) return;
    console.log("[BCP action] explain_top_channel", {
      channel: top.ch.name,
      bcs: Math.round(top.bcs),
      components: {
        A: Math.round(top.A),
        T: Math.round(top.T),
        E: Math.round(top.E),
        C: Math.round(top.C),
      },
      affAvg: Math.round(top.affAvg),
      ageMod: top.ageMod.toFixed(2),
    });
  };

  const handleHandoff = () => {
    if (!computation) return;
    console.log("[BCP action] handoff_payload", {
      campaignName: state.campaignName,
      flight: state.flight,
      successMetric: state.successMetric,
      totalBcs: Math.round(computation.total),
      mix: computation.allocated.map((a) => ({
        channel: a.ch.id,
        name: a.ch.name,
        dollars: a.dollars,
        pct: Math.round(a.pct * 10) / 10,
        bcs: Math.round(a.bcs),
      })),
    });
  };

  if (loading && !adapted) {
    return (
      <div className="mt-6 rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Loading audience profile…
      </div>
    );
  }

  if (error && !adapted) {
    return (
      <div className="mt-6 rounded-lg border border-status-critical-fg/30 bg-pacing-critical-bg px-4 py-6 text-sm text-status-critical-fg">
        <p className="font-medium">Could not load audience data</p>
        <p className="mt-1 text-xs opacity-90">{error}</p>
      </div>
    );
  }

  if (!computation || !adapted) {
    return (
      <div className="mt-6 rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Choose a segment lens to compose an audience.
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div className="mt-4 rounded-md border border-status-critical-fg/30 bg-pacing-critical-bg px-3 py-2 text-xs text-status-critical-fg">
          Refresh failed: {error}
        </div>
      ) : null}

      {adapted.suppressedCells > 0 ? (
        <div className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {adapted.suppressedCells} thin-base cells excluded
        </div>
      ) : null}

      {loading ? (
        <div className="mt-2 text-[11px] text-muted-foreground">Updating audience…</div>
      ) : null}

      <div className="mb-2 mt-6 flex items-baseline justify-between border-b pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Recommended mix</span>
        <span className="flex items-baseline gap-1.5">
          <span className="num text-2xl font-medium tabular-nums text-foreground">
            {Math.round(computation.total)}
          </span>
          <span className="normal-case tracking-normal">total BCS</span>
        </span>
      </div>

      <MetricCards
        reach={computation.reach}
        attentionSeconds={computation.attn}
        effectiveCpm={computation.cpm}
        audienceWc={computation.audience}
      />

      <ReachProfile rows={adapted.reachProfile} show18Base={show18Base} />

      <div className="mb-3 rounded-lg border bg-card p-4">
        <Tabs defaultValue="mix">
          <TabsList>
            <TabsTrigger value="mix">Channel mix</TabsTrigger>
            <TabsTrigger value="moments">Cultural moments</TabsTrigger>
            <TabsTrigger value="ava">AVA narration</TabsTrigger>
          </TabsList>

          <TabsContent value="mix" className="mt-3 min-h-[320px]">
            <ChannelMixTable allocated={computation.allocated} show18Base={show18Base} />
          </TabsContent>

          <TabsContent value="moments" className="mt-3 min-h-[320px]">
            <CulturalMomentsList flight={state.flight} geos={computation.inputs.geos} />
          </TabsContent>

          <TabsContent value="ava" className="mt-3 min-h-[320px]">
            <AvaNarration inputs={computation.inputs} allocated={computation.allocated} />
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleStressTest}>
            Stress test: budget −30%
          </Button>
          <Button variant="outline" size="sm" onClick={handleExplainTop}>
            Explain top channel
          </Button>
          <Button variant="outline" size="sm" onClick={handleHandoff}>
            Hand off to planner
          </Button>
        </div>
      </div>
    </div>
  );
}
