"use client"

import * as React from "react"
import { AlertTriangle, Inbox } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode
  title?: React.ReactNode
  message?: React.ReactNode
  action?: React.ReactNode
}

export function EmptyState({
  icon,
  title = "No data yet",
  message = "There is nothing to show for this view.",
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[180px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-panel px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-pill bg-pacing-on-track-bg text-status-on-track-fg">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export type LoadingStateProps = React.HTMLAttributes<HTMLDivElement> & {
  rows?: number
}

export function LoadingState({ rows = 4, className, ...props }: LoadingStateProps) {
  return (
    <div
      className={cn("space-y-3 rounded-card border border-border bg-card p-4", className)}
      aria-busy="true"
      {...props}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-pill" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export type ErrorStateProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode
  message?: React.ReactNode
  action?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({
  title = "Something went wrong",
  message = "Try again, or refresh this view if the problem continues.",
  action,
  onRetry,
  retryLabel = "Retry",
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-[var(--status-critical-fg)]/20 bg-pacing-critical-bg px-5 py-4 text-status-critical-fg",
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-pacing-critical-bg">
          <AlertTriangle className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {message ? <p className="mt-1 text-sm text-status-critical-fg/80">{message}</p> : null}
          {action || onRetry ? (
            <div className="mt-4">
              {action ?? (
                <Button type="button" size="sm" onClick={onRetry} className="bg-primary text-primary-foreground">
                  {retryLabel}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
