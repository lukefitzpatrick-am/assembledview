/** BCS weight vector — same shape as the behavioural-planner engine. */
export type Weights = { A: number; T: number; E: number; C: number }

/** Prototype category picklist (Demand-Flow HTM). */
export const PLANNING_CATEGORIES = [
  "FMCG",
  "Automotive",
  "Finance & insurance",
  "Telco & utilities",
  "Retail",
  "Government & NFP",
  "Travel & tourism",
  "Entertainment & media",
  "Health & pharma",
  "Technology",
  "Other",
] as const

export type PlanningCategory = (typeof PLANNING_CATEGORIES)[number]

export type ObjectiveKind = "awareness" | "consideration" | "capture" | "retention"

export type AudienceAccent = {
  /** Tailwind bg token for header/bar fills. */
  bg: string
  /** Tailwind text token. */
  text: string
  /** CSS var for inline bar width colour (data-driven width only). */
  cssVar: string
  label: string
}

/** Three audience accent colours — brand purple/green palette (not channel-tv red). */
export const AUDIENCE_ACCENTS: AudienceAccent[] = [
  {
    bg: "bg-audience-1",
    text: "text-audience-1",
    cssVar: "var(--audience-1)",
    label: "Purple",
  },
  {
    bg: "bg-audience-2",
    text: "text-audience-2",
    cssVar: "var(--audience-2)",
    label: "Green",
  },
  {
    bg: "bg-audience-3",
    text: "text-audience-3",
    cssVar: "var(--audience-3)",
    label: "Deep purple",
  },
]

/**
 * Stage A objective cards → BCS Create:Capture preset.
 * Engine semantics unchanged: objective 0 = brand-heavy (E blends toward B),
 * 100 = action-heavy (E blends toward D). Weights feed computeBcs A/T/E/C.
 */
export const OBJECTIVE_PRESETS: Record<
  ObjectiveKind,
  { label: string; blurb: string; createCapture: number; weights: Weights }
> = {
  awareness: {
    label: "Awareness",
    blurb: "Brand-heavy create bias",
    createCapture: 20,
    weights: { A: 35, T: 30, E: 25, C: 10 },
  },
  consideration: {
    label: "Consideration",
    blurb: "Balanced create ↔ capture",
    createCapture: 45,
    weights: { A: 30, T: 25, E: 30, C: 15 },
  },
  capture: {
    label: "Capture",
    blurb: "Action-heavy capture bias",
    createCapture: 80,
    weights: { A: 20, T: 20, E: 35, C: 25 },
  },
  retention: {
    label: "Retention",
    blurb: "Loyalty with efficiency",
    createCapture: 55,
    weights: { A: 25, T: 25, E: 30, C: 20 },
  },
}

export type SalienceLevel = "low" | "medium" | "high"

export const SALIENCE_OPTIONS: { id: SalienceLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
]

export const STAGES = [
  { id: "brief", label: "A Brief & objective" },
  { id: "audiences", label: "B Audiences" },
  { id: "diagnosis", label: "C Demand diagnosis" },
  { id: "constraints", label: "D Constraints" },
  { id: "compare", label: "E Compare & plan" },
] as const

export type StageId = (typeof STAGES)[number]["id"]

export const MAX_AUDIENCES = 3
