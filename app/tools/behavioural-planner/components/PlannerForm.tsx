"use client";

import type { FlightId, Gender, Weights } from "../lib/types";
import type {
  PlanningAgeBand,
  PlanningSegment,
  PlanningState,
  ReachBasis,
} from "@/lib/planning/types";
import { BriefCard } from "./BriefCard";
import { ObjectiveCard } from "./ObjectiveCard";
import { AudienceCard } from "./AudienceCard";
import { WeightsCard } from "./WeightsCard";

export interface FormState {
  campaignName: string;
  successMetric: string;
  objective: number;
  weights: Weights;
  flight: FlightId;
  budget: number;
  segmentId: string;
  states: PlanningState[];
  ageBands: PlanningAgeBand[];
  gender: Gender;
  reachBasis: ReachBasis;
  waveId: string;
}

interface PlannerFormProps {
  state: FormState;
  segments: PlanningSegment[];
  onChange: (next: FormState) => void;
}

export function PlannerForm({ state, segments, onChange }: PlannerFormProps) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div>
      <BriefCard
        campaignName={state.campaignName}
        flight={state.flight}
        budget={state.budget}
        successMetric={state.successMetric}
        onCampaignNameChange={(v) => update("campaignName", v)}
        onFlightChange={(v: FlightId) => update("flight", v)}
        onBudgetChange={(v) => update("budget", v)}
        onSuccessMetricChange={(v) => update("successMetric", v)}
      />
      <ObjectiveCard objective={state.objective} onChange={(v) => update("objective", v)} />
      <AudienceCard
        segments={segments}
        segmentId={state.segmentId}
        states={state.states}
        gender={state.gender}
        ageBands={state.ageBands}
        reachBasis={state.reachBasis}
        onSegmentChange={(id) => update("segmentId", id)}
        onStatesChange={(next) => update("states", next)}
        onGenderChange={(g: Gender) => update("gender", g)}
        onAgeBandsChange={(bands) => update("ageBands", bands)}
        onReachBasisChange={(basis) => update("reachBasis", basis)}
      />
      <WeightsCard weights={state.weights} onChange={(w: Weights) => update("weights", w)} />
    </div>
  );
}
