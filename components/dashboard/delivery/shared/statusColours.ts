export type DeliveryStatus = "on-track" | "ahead" | "behind" | "no-data"

/** Solid background, used for dots, ribbons, and progress fills. */
export const statusBg: Record<DeliveryStatus, string> = {
  "on-track": "bg-pacing-on-track",
  ahead: "bg-pacing-ahead",
  behind: "bg-pacing-behind",
  "no-data": "bg-muted-foreground",
}

/** Translucent background + text, used for status pills. */
export const statusBadge: Record<DeliveryStatus, string> = {
  "on-track": "bg-pacing-on-track-bg text-status-on-track-fg",
  ahead: "bg-pacing-ahead-bg text-status-ahead-fg",
  behind: "bg-pacing-behind-bg text-status-behind-fg",
  "no-data": "bg-muted text-muted-foreground",
}

/** Display label. "Off pace" is the user-facing term for `behind`. */
export const statusLabel: Record<DeliveryStatus, string> = {
  "on-track": "On track",
  ahead: "Ahead",
  behind: "Off pace",
  "no-data": "No data",
}
