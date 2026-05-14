"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import {
  allocate,
  audienceSize,
  computeBcs,
  effectiveCpm,
  totalAttention,
  totalBcs,
  totalReach,
} from "../lib/bcs-engine";
import type { PlannerInputs } from "../lib/types";
import type { FormState } from "./PlannerForm";

import { MetricCards } from "./MetricCards";
import { ChannelMixTable } from "./ChannelMixTable";
import { CulturalMomentsList } from "./CulturalMomentsList";
import { AvaNarration } from "./AvaNarration";

interface ResultsPanelProps {
  state: FormState;
}

// FormState is a superset of PlannerInputs (adds campaignName + successMetric
// which are display-only). Strip them out for engine calls so the engine
// signature stays narrow and unchanged from Stage 1.
function toEngineInputs(state: FormState): PlannerInputs {
  return {
    objective: state.objective,
    segments: state.segments,
    weights: state.weights,
    flight: state.flight,
    budget: state.budget,
    ageMin: state.ageMin,
    ageMax: state.ageMax,
    gender: state.gender,
    geos: state.geos,
  };
}

export function ResultsPanel({ state }: ResultsPanelProps) {
  const computation = useMemo(() => {
    const inputs = toEngineInputs(state);
    const scored = computeBcs(inputs);
    const allocated = allocate(scored, inputs.budget);
    return {
      inputs,
      scored,
      allocated,
      total: totalBcs(allocated),
      reach: totalReach(allocated),
      attn: totalAttention(allocated),
      cpm: effectiveCpm(allocated),
      audience: audienceSize(inputs),
    };
  }, [state]);

  // Action button handlers. These are stubs for the mock — they log a payload
  // so stakeholder feedback can confirm the right context flows out, then
  // wire up to real handlers (Claude API, planner export, etc.) in a later
  // phase. No alert(); console is sufficient for mock review.
  const handleStressTest = () => {
    console.log("[BCP mock action] stress_test", {
      currentBudget: state.budget,
      proposedBudget: Math.round(state.budget * 0.7),
      currentMix: computation.allocated.map((a) => ({
        ch: a.ch.id,
        pct: Math.round(a.pct),
      })),
    });
  };

  const handleExplainTop = () => {
    const top = computation.allocated[0];
    if (!top) return;
    console.log("[BCP mock action] explain_top_channel", {
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
    console.log("[BCP mock action] handoff_payload", {
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

  return (
    <div>
      <div className="mb-2 mt-6 flex items-baseline justify-between border-b pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Recommended mix</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-2xl font-medium tabular-nums text-foreground">
            {Math.round(computation.total)}
          </span>
          <span className="normal-case tracking-normal">total BCS</span>
        </span>
      </div>

      <MetricCards
        reach={computation.reach}
        attentionSeconds={computation.attn}
        effectiveCpm={computation.cpm}
        audienceMillions={computation.audience}
      />

      <div className="mb-3 rounded-lg border bg-card p-4">
        <Tabs defaultValue="mix">
          <TabsList>
            <TabsTrigger value="mix">Channel mix</TabsTrigger>
            <TabsTrigger value="moments">Cultural moments</TabsTrigger>
            <TabsTrigger value="ava">AVA narration</TabsTrigger>
          </TabsList>

          <TabsContent value="mix" className="mt-3 min-h-[320px]">
            <ChannelMixTable allocated={computation.allocated} />
          </TabsContent>

          <TabsContent value="moments" className="mt-3 min-h-[320px]">
            <CulturalMomentsList flight={state.flight} geos={state.geos} />
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
