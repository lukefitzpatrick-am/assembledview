import { PACING_UI_STATUS, TONE_DOT, TONE_TEXT } from "@/lib/design/status"

export type DeliveryStatus = "on-track" | "ahead" | "behind" | "no-data"

/** Solid background, used for dots, ribbons, and progress fills. */
export const statusBg: Record<DeliveryStatus, string> = {
  "on-track": TONE_DOT[PACING_UI_STATUS["on-track"].tone],
  ahead: TONE_DOT[PACING_UI_STATUS.ahead.tone],
  behind: TONE_DOT[PACING_UI_STATUS.behind.tone],
  "no-data": TONE_DOT[PACING_UI_STATUS["no-data"].tone],
}

/** Translucent background + text, used for status pills. */
export const statusBadge: Record<DeliveryStatus, string> = {
  "on-track": `bg-tone-action-bg ${TONE_TEXT[PACING_UI_STATUS["on-track"].tone]}`,
  ahead: `bg-tone-insight-bg ${TONE_TEXT[PACING_UI_STATUS.ahead.tone]}`,
  behind: `bg-tone-attention-bg ${TONE_TEXT[PACING_UI_STATUS.behind.tone]}`,
  "no-data": `bg-tone-neutral-bg ${TONE_TEXT[PACING_UI_STATUS["no-data"].tone]}`,
}

/** Display label. "Off pace" is the user-facing term for `behind`. */
export const statusLabel: Record<DeliveryStatus, string> = {
  "on-track": "On track",
  ahead: "Ahead",
  behind: "Off pace",
  "no-data": "No data",
}
