import { cn } from "@/lib/utils";

interface BcsBadgeProps {
  value: number;
}

// Three-tier banding: strong (70+), solid (50-70), weak (<50).
// Kept as a tiny component so the banding logic lives in one place.
export function BcsBadge({ value }: BcsBadgeProps) {
  const rounded = Math.round(value);
  const tone =
    value >= 70
      ? "bg-pacing-ahead-bg text-status-ahead-fg"
      : value >= 50
        ? "bg-pacing-behind-bg text-status-behind-fg"
        : "bg-pacing-critical-bg text-status-critical-fg";

  return (
    <span
      className={cn(
        "num inline-flex min-w-[2rem] items-center justify-center rounded-pill px-2 py-0.5 text-xs font-medium",
        tone
      )}
    >
      {rounded}
    </span>
  );
}
