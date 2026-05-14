import { cn } from "@/lib/utils";

interface BcsBadgeProps {
  value: number;
}

// Three-tier banding: strong (70+), solid (50-70), weak (<50). Colors match
// the v2 artifact mock. Kept as a tiny component so the banding logic lives
// in one place if we want to tune thresholds later.
export function BcsBadge({ value }: BcsBadgeProps) {
  const rounded = Math.round(value);
  const tone =
    value >= 70
      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      : value >= 50
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100";

  return (
    <span
      className={cn(
        "inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        tone
      )}
    >
      {rounded}
    </span>
  );
}
