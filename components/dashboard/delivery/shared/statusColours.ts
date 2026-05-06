export type DeliveryStatus = "on-track" | "ahead" | "behind" | "no-data"

/** Solid background, used for dots, ribbons, and progress fills. */
export const statusBg: Record<DeliveryStatus, string> = {
  "on-track": "bg-emerald-500",
  ahead: "bg-blue-500",
  behind: "bg-amber-500",
  "no-data": "bg-muted-foreground",
}

/** Translucent background + text, used for status pills. */
export const statusBadge: Record<DeliveryStatus, string> = {
  "on-track": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ahead: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  behind: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "no-data": "bg-muted text-muted-foreground",
}

/** Display label. "Off pace" is the user-facing term for `behind`. */
export const statusLabel: Record<DeliveryStatus, string> = {
  "on-track": "On track",
  ahead: "Ahead",
  behind: "Off pace",
  "no-data": "No data",
}

/** Stroke colour for chart series, paired with status. */
export const statusStroke: Record<DeliveryStatus, string> = {
  "on-track": "hsl(160 84% 39%)",
  ahead: "hsl(217 91% 60%)",
  behind: "hsl(38 92% 50%)",
  "no-data": "hsl(var(--muted-foreground))",
}
