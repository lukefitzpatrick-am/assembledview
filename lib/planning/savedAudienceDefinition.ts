import {
  createAudienceDraft,
  type AudienceDraft,
  type BriefState,
  type DiagnosisState,
} from "@/components/planning/store"
import type { RecommendedSplitV1 } from "@/lib/planning/recommendedSplit"

export type SavedAudienceDefinition = {
  audience: AudienceDraft
  brief: BriefState
  diagnosis: DiagnosisState
  exclusions: string[]
  wave_id: string
  /** Frozen Stage E → create handoff snapshot (lives in freeform definition_json). */
  recommended_split?: RecommendedSplitV1
  /** Additive; missing on pre-upload saved rows → parse as `"composed"`. */
  source?: "composed" | "uploaded"
  uploaded_audience_id?: number | null
  upload_file_name?: string | null
  upload_wave_code?: string | null
  upload_filter_label?: string | null
}

export function savedAudienceProvenanceFields(draft: AudienceDraft): Pick<
  SavedAudienceDefinition,
  | "source"
  | "uploaded_audience_id"
  | "upload_file_name"
  | "upload_wave_code"
  | "upload_filter_label"
> {
  return {
    source: draft.source === "uploaded" ? "uploaded" : "composed",
    uploaded_audience_id: draft.uploadedAudienceId ?? null,
    upload_file_name: draft.uploadFileName ?? null,
    upload_wave_code: draft.uploadWaveCode ?? null,
    upload_filter_label: draft.uploadFilterLabel ?? null,
  }
}

function asSource(value: unknown): "composed" | "uploaded" | undefined {
  if (value === "uploaded" || value === "composed") return value
  return undefined
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const t = value.trim()
  return t || undefined
}

function asOptionalId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value
  }
  return undefined
}

export function parseSavedDefinition(raw: unknown): SavedAudienceDefinition | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (!o.audience || typeof o.audience !== "object") return null
  const audience = o.audience as AudienceDraft
  if (!audience.id || !audience.name) return null
  const segmentId =
    typeof audience.segmentId === "string" && audience.segmentId.trim()
      ? audience.segmentId
      : "base"
  const source =
    asSource(o.source) ?? asSource(audience.source) ?? "composed"
  const uploadedAudienceId =
    asOptionalId(o.uploaded_audience_id) ?? asOptionalId(audience.uploadedAudienceId)
  const uploadFileName =
    asOptionalString(o.upload_file_name) ?? asOptionalString(audience.uploadFileName)
  const uploadWaveCode =
    asOptionalString(o.upload_wave_code) ?? asOptionalString(audience.uploadWaveCode)
  const uploadFilterLabel =
    asOptionalString(o.upload_filter_label) ??
    asOptionalString(audience.uploadFilterLabel)

  return {
    audience: createAudienceDraft({
      ...audience,
      colorIndex: (audience.colorIndex ?? 0) as 0 | 1 | 2,
      segmentId,
      id: audience.id,
      source,
      uploadedAudienceId,
      uploadFileName,
      uploadWaveCode,
      uploadFilterLabel,
    }),
    brief: (o.brief && typeof o.brief === "object" ? o.brief : {}) as BriefState,
    diagnosis: (o.diagnosis && typeof o.diagnosis === "object"
      ? o.diagnosis
      : {
          penetration: 35,
          target: 45,
          salience: "medium",
          createCapture: 35,
          weights: { A: 30, T: 25, E: 30, C: 15 },
        }) as DiagnosisState,
    exclusions: Array.isArray(o.exclusions)
      ? o.exclusions.map((x) => String(x))
      : [],
    wave_id: typeof o.wave_id === "string" ? o.wave_id : "",
    source,
    uploaded_audience_id: uploadedAudienceId ?? null,
    upload_file_name: uploadFileName ?? null,
    upload_wave_code: uploadWaveCode ?? null,
    upload_filter_label: uploadFilterLabel ?? null,
  }
}
