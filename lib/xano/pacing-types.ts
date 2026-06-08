/**
 * Pacing filter status values for the overview/search filter toolbar.
 * Field names use snake_case to match REST conventions.
 */

export type PacingStatus =
  | "not_started"
  | "on_track"
  | "slightly_under"
  | "under_pacing"
  | "slightly_over"
  | "over_pacing"
  | "no_delivery"
  | "completed"
