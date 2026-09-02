import { effectiveSegmentId, type AudienceDraft } from "@/components/planning/store"
import { PLANNING_GENDERS, type AudienceRequest, type ReachBasis } from "./types"

export function toAudienceRequest(
  waveId: string,
  draft: AudienceDraft
): AudienceRequest | null {
  if ((draft.source ?? "composed") === "uploaded") return null
  if (!waveId) return null
  if (draft.states.length === 0) return null
  const genders =
    draft.gender === "all"
      ? []
      : PLANNING_GENDERS.includes(draft.gender as (typeof PLANNING_GENDERS)[number])
        ? [draft.gender as (typeof PLANNING_GENDERS)[number]]
        : []
  return {
    wave_id: waveId,
    segment_id: effectiveSegmentId(draft.segmentId),
    states: draft.states,
    genders,
    age_bands: draft.ageBands,
    reach_basis: draft.reachBasis as ReachBasis,
  }
}

export function audienceKey(waveId: string, draft: AudienceDraft): string {
  return [
    waveId,
    draft.id,
    effectiveSegmentId(draft.segmentId),
    draft.states.join(","),
    draft.ageBands.join(","),
    draft.gender,
    draft.reachBasis,
    draft.source ?? "composed",
    draft.uploadedAudienceId ?? "",
  ].join("|")
}

export type AudienceFetchSpec =
  | { kind: "skip" }
  | { kind: "live"; url: "/api/planning/audience"; body: AudienceRequest }
  | {
      kind: "uploaded"
      url: "/api/planning/audience/uploaded"
      body: { uploaded_audience_id: number; reach_basis: ReachBasis }
    }

export function resolveAudienceFetch(
  waveId: string,
  draft: AudienceDraft
): AudienceFetchSpec {
  if ((draft.source ?? "composed") === "uploaded") {
    if (!draft.uploadedAudienceId) return { kind: "skip" }
    return {
      kind: "uploaded",
      url: "/api/planning/audience/uploaded",
      body: {
        uploaded_audience_id: draft.uploadedAudienceId,
        reach_basis: draft.reachBasis as ReachBasis,
      },
    }
  }
  const body = toAudienceRequest(waveId, draft)
  if (!body) return { kind: "skip" }
  return { kind: "live", url: "/api/planning/audience", body }
}
