import { relabelsHref, mbaStem } from "@/lib/pacing/relabel/shared/relabelPageUrl"
import { cn } from "@/lib/utils"

export function RelabelUnmappedHint({
  mba,
  className,
}: {
  mba: string
  className?: string
}) {
  const stem = mbaStem(mba)
  if (!stem) return null
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Unmapped CM360 placements for {stem}.{" "}
      <a
        href={relabelsHref({ tab: "unmapped", mba: stem })}
        className="text-primary underline-offset-2 hover:underline"
      >
        Open Unmapped tab →
      </a>
    </p>
  )
}
