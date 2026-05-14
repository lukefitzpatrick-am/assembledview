"use client";

import type { PlannerInputs, FlightId, Gender, GeoId, SegmentId, Weights } from "../lib/types";
import { BriefCard } from "./BriefCard";
import { ObjectiveCard } from "./ObjectiveCard";
import { AudienceCard } from "./AudienceCard";
import { WeightsCard } from "./WeightsCard";

// FormState extends PlannerInputs with the brief fields that don't affect
// BCS calculation but are part of the planner record (campaign name, success
// metric). Kept here so the form has one tidy state shape.
export interface FormState extends PlannerInputs {
  campaignName: string;
  successMetric: string;
}

interface PlannerFormProps {
  state: FormState;
  onChange: (next: FormState) => void;
}

export function PlannerForm({ state, onChange }: PlannerFormProps) {
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
        ageMin={state.ageMin}
        ageMax={state.ageMax}
        gender={state.gender}
        geos={state.geos}
        segments={state.segments}
        onAgeChange={([lo, hi]) => onChange({ ...state, ageMin: lo, ageMax: hi })}
        onGenderChange={(g: Gender) => update("gender", g)}
        onGeosChange={(nextGeos: GeoId[]) => update("geos", nextGeos)}
        onSegmentsChange={(segs: SegmentId[]) => update("segments", segs)}
      />
      <WeightsCard weights={state.weights} onChange={(w: Weights) => update("weights", w)} />
    </div>
  );
}
