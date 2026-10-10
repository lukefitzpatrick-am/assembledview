import { cn } from "@/lib/utils"

const BARS = [
  { height: "h-[46px]", tone: "bg-am-sky" },
  { height: "h-[66px]", tone: "bg-am-forest-light" },
  { height: "h-[88px]", tone: "bg-am-lime" },
] as const

/** Decorative arches. Hidden below 980px. */
export function ArchTrio({ className }: { className?: string }) {
  return (
    <div
      className={cn("hidden items-end gap-2 min-[980px]:flex", className)}
      aria-hidden="true"
    >
      {BARS.map((bar) => (
        <span
          key={bar.height}
          className={cn("block w-[34px] rounded-t-pill", bar.height, bar.tone)}
        />
      ))}
    </div>
  )
}
