"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_INPUTS } from "./lib/data";
import { PlannerForm, type FormState } from "./components/PlannerForm";
import { ResultsPanel } from "./components/ResultsPanel";
import { adaptAudienceToEngine, type AdapterResult } from "@/lib/planning/adapter";
import type {
  AudienceRequest,
  AudienceResponse,
  PlanningAgeBand,
  PlanningMeta,
  PlanningState,
  ReachBasis,
} from "@/lib/planning/types";
import { PLANNING_GENDERS } from "@/lib/planning/types";

const DEBOUNCE_MS = 350;

function buildInitialState(meta: PlanningMeta | null): FormState {
  const waveId = meta?.waves[0]?.wave_id ?? "";
  const segmentId =
    meta?.segments.find((s) => s.segment_id === "metro")?.segment_id ??
    meta?.segments.find((s) => /metro|cap.?cit/i.test(s.name))?.segment_id ??
    meta?.segments[0]?.segment_id ??
    "";
  return {
    objective: DEFAULT_INPUTS.objective,
    weights: { ...DEFAULT_INPUTS.weights },
    flight: DEFAULT_INPUTS.flight,
    budget: DEFAULT_INPUTS.budget,
    gender: DEFAULT_INPUTS.gender,
    campaignName: DEFAULT_INPUTS.campaignName,
    successMetric: DEFAULT_INPUTS.successMetric,
    ageBands: [...DEFAULT_INPUTS.ageBands] as PlanningAgeBand[],
    states: [...DEFAULT_INPUTS.states] as PlanningState[],
    reachBasis: DEFAULT_INPUTS.reachBasis,
    waveId,
    segmentId,
  };
}

function toAudienceRequest(state: FormState): AudienceRequest | null {
  if (!state.waveId || !state.segmentId) return null;
  if (state.states.length === 0) return null;
  const genders =
    state.gender === "all"
      ? []
      : PLANNING_GENDERS.includes(state.gender as (typeof PLANNING_GENDERS)[number])
        ? [state.gender as (typeof PLANNING_GENDERS)[number]]
        : [];
  return {
    wave_id: state.waveId,
    segment_id: state.segmentId,
    states: state.states,
    genders,
    age_bands: state.ageBands,
    reach_basis: state.reachBasis as ReachBasis,
  };
}

export function BehaviouralPlannerClient() {
  const [meta, setMeta] = useState<PlanningMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [state, setState] = useState<FormState>(() => buildInitialState(null));
  const [adapted, setAdapted] = useState<AdapterResult | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceError, setAudienceError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGen = useRef(0);

  // Load meta once.
  useEffect(() => {
    let cancelled = false;
    ;(async () => {
      setMetaLoading(true);
      setMetaError(null);
      try {
        const res = await fetch("/api/planning/meta");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Meta request failed (${res.status})`);
        }
        const data = (await res.json()) as PlanningMeta;
        if (cancelled) return;
        setMeta(data);
        setState(buildInitialState(data));
      } catch (err) {
        if (cancelled) return;
        setMetaError(err instanceof Error ? err.message : "Failed to load planning meta");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAudience = useCallback(
    async (req: AudienceRequest, currentMeta: PlanningMeta, segmentId: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++requestGen.current;

      setAudienceLoading(true);
      setAudienceError(null);

      try {
        const res = await fetch("/api/planning/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
          signal: ac.signal,
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errBody?.error ?? `Audience request failed (${res.status})`);
        }
        const data = (await res.json()) as AudienceResponse;
        if (gen !== requestGen.current) return;
        const next = adaptAudienceToEngine({
          audience: data,
          meta: currentMeta,
          segmentId,
        });
        if (next.skippedEngineIds.length > 0) {
          console.warn(
            "[planning] skipped engine channels without bench/defaults:",
            next.skippedEngineIds
          );
        }
        setAdapted(next);
      } catch (err) {
        if (ac.signal.aborted) return;
        if (gen !== requestGen.current) return;
        setAudienceError(err instanceof Error ? err.message : "Failed to compose audience");
        // No silent fallback to seeds — clear prior adapted data on hard failure.
        setAdapted(null);
      } finally {
        if (gen === requestGen.current) setAudienceLoading(false);
      }
    },
    []
  );

  const audienceKey = [
    state.waveId,
    state.segmentId,
    state.states.join(","),
    state.ageBands.join(","),
    state.gender,
    state.reachBasis,
  ].join("|");

  // Debounced audience fetch on audience-relevant inputs only.
  useEffect(() => {
    if (!meta) return;
    const body = toAudienceRequest(state);
    if (!body) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchAudience(body, meta, body.segment_id);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // audienceKey captures the audience slice; body is built from that same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, audienceKey, fetchAudience]);

  const handleReset = () => {
    if (meta) setState(buildInitialState(meta));
  };

  if (metaLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading planning catalogue…</p>
      </div>
    );
  }

  if (metaError || !meta) {
    return (
      <div className="container mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-lg border border-status-critical-fg/30 bg-pacing-critical-bg px-4 py-6 text-sm text-status-critical-fg">
          <p className="font-medium">Could not load planning meta</p>
          <p className="mt-1 text-xs opacity-90">{metaError ?? "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between border-b pb-3">
        <div>
          <h1 className="text-xl font-medium">
            Behavioural change planner
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              working title · live Roy Morgan
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audience composition from Roy Morgan weighted counts, BCS channel mix on live
            affinities.
            {meta.waves[0] ? (
              <span className="ml-1 text-muted-foreground">
                Wave {meta.waves[0].label || meta.waves[0].wave_id}.
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Reset to defaults
        </button>
      </div>

      <PlannerForm state={state} segments={meta.segments} onChange={setState} />
      <ResultsPanel
        state={state}
        adapted={adapted}
        loading={audienceLoading}
        error={audienceError}
      />
    </div>
  );
}
