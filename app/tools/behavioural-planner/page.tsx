"use client";

import { useEffect, useState } from "react";
import { DEFAULT_INPUTS } from "./lib/data";
import { PlannerForm, type FormState } from "./components/PlannerForm";
import { ResultsPanel } from "./components/ResultsPanel";

const initialState: FormState = {
  objective: DEFAULT_INPUTS.objective,
  segments: [...DEFAULT_INPUTS.segments],
  weights: { ...DEFAULT_INPUTS.weights },
  flight: DEFAULT_INPUTS.flight,
  budget: DEFAULT_INPUTS.budget,
  ageMin: DEFAULT_INPUTS.ageMin,
  ageMax: DEFAULT_INPUTS.ageMax,
  gender: DEFAULT_INPUTS.gender,
  geos: [...DEFAULT_INPUTS.geos],
  campaignName: DEFAULT_INPUTS.campaignName,
  successMetric: DEFAULT_INPUTS.successMetric,
};

export default function BehaviouralPlannerPage() {
  const [state, setState] = useState<FormState>(initialState);

  useEffect(() => {
    console.log("[BCP mock] Form state:", state);
  }, [state]);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between border-b pb-3">
        <div>
          <h1 className="text-xl font-medium">
            Behavioural change planner
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              working title · v0.2 mock
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Topline channel mix planner with proprietary BCS scoring. Mock data only — no Xano wiring yet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setState(initialState)}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Reset to defaults
        </button>
      </div>

      <PlannerForm state={state} onChange={setState} />
      <ResultsPanel state={state} />
    </div>
  );
}
