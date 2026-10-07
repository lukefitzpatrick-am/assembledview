import { Badge, type BadgeProps } from "@/components/ui/badge"
import { TONE_DOT, type Tone } from "@/lib/design/status"
import { cn } from "@/lib/utils"

export function StatusPill({
  tone,
  label,
  dot = true,
  pulse = false,
  size = "md",
  className,
}: {
  tone: Tone
  label: string
  dot?: boolean
  pulse?: boolean
  size?: NonNullable<BadgeProps["size"]>
  className?: string
}) {
  return (
    <Badge variant={tone} size={size} className={className}>
      {dot ? (
        <span
          className={cn(
            "mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            TONE_DOT[tone],
            pulse && "motion-safe:animate-pulse",
          )}
          aria-hidden
        />
      ) : null}
      {label}
    </Badge>
  )
}
