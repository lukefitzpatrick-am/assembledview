/**
 * @example Storybook-style usage (not rendered — paste into a story or page)
 *
 * ```tsx
 * import { Activity, RefreshCw } from "lucide-react"
 * import { Button } from "@/components/ui/button"
 * import { PacingCard, PacingSubCard } from "@/components/dashboard/pacing/PacingCard"
 *
 * export function PacingCardExample() {
 *   return (
 *     <PacingCard
 *       icon={Activity}
 *       title="Social performance"
 *       subtitle="client-slug • MBA-12345"
 *       actions={
 *         <>
 *           <Button size="sm" variant="outline">Export</Button>
 *           <Button size="sm" variant="outline"><RefreshCw className="h-4 w-4" /></Button>
 *         </>
 *       }
 *     >
 *       <PacingSubCard icon={Activity} title="Line item" subtitle="Meta • CPC">
 *         <p className="text-sm text-muted-foreground">Inner metrics or chart.</p>
 *       </PacingSubCard>
 *     </PacingCard>
 *   )
 * }
 * ```
 */

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { cn } from "@/lib/utils"

export type PacingCardProps = {
  icon: LucideIcon
  title: string
  subtitle?: string
  /** Right-aligned slot for buttons (export, refresh). */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function PacingCard({ icon: Icon, title, subtitle, actions, children, className }: PacingCardProps) {
  return (
    <BaseChartCard
      title={title}
      description={subtitle}
      variant="icon"
      icon={Icon}
      toolbar={actions}
      className={className}
    >
      {children}
    </BaseChartCard>
  )
}

export type PacingSubCardProps = {
  icon: LucideIcon
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Nested sections inside a {@link PacingCard} (e.g. accordion line-item blocks). */
export function PacingSubCard({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
  className,
}: PacingSubCardProps) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-background/60 p-4", className)}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}
