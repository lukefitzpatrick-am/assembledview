const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null;

  if (!date || isNaN(date.getTime())) return null;
  return date;
};

/**
 * Builds a display label for a burst.
 *
 * - Always uses a 1-based burst index (e.g., 1, 2, 3).
 * - If start and end dates are valid and fall in the same month/year, appends
 *   ` - MMM` (e.g., `Burst 1 - Feb`).
 * - If dates are missing, invalid, or span different months, returns just
 *   `Burst {index}`.
 */
export function formatBurstLabel(
  displayIndex: number,
  startDate?: unknown,
  endDate?: unknown
): string {
  const baseLabel = `Burst ${displayIndex}`;

  const start = toValidDate(startDate);
  const end = toValidDate(endDate);

  if (!start || !end) return baseLabel;

  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if (!sameMonth) return baseLabel;

  const monthLabel = start.toLocaleString("default", { month: "short" });
  return `${baseLabel} - ${monthLabel}`;
}

export default formatBurstLabel;
