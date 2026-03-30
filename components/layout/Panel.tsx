"use client"

import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type PanelVariant = "default" | "loading" | "empty" | "error"

type PanelContextValue = {
  variant: PanelVariant
  emptyMessage?: React.ReactNode
  errorMessage?: React.ReactNode
}

const PanelContext = React.createContext<PanelContextValue | null>(null)

function usePanelContext(component: string) {
  const ctx = React.useContext(PanelContext)
  if (!ctx) {
    throw new Error(`${component} must be used within <Panel>`)
  }
  return ctx
}

export type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: PanelVariant
  /** Shown when `variant` is `empty` (unless `PanelContent` supplies its own handling). */
  emptyMessage?: React.ReactNode
  /** Shown when `variant` is `error`. */
  errorMessage?: React.ReactNode
}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  (
    {
      className,
      variant = "default",
      emptyMessage,
      errorMessage,
      children,
      ...props
    },
    ref
  ) => {
    const value = React.useMemo(
      () => ({ variant, emptyMessage, errorMessage }),
      [variant, emptyMessage, errorMessage]
    )

    return (
      <PanelContext.Provider value={value}>
        <div
          ref={ref}
          className={cn(
            "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
            className
          )}
          data-variant={variant}
          aria-busy={variant === "loading" ? true : undefined}
          {...props}
        >
          {children}
        </div>
      </PanelContext.Provider>
    )
  }
)
Panel.displayName = "Panel"

const PanelHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-start justify-between gap-4 px-6 pt-6", className)}
      {...props}
    />
  )
)
PanelHeader.displayName = "PanelHeader"

const PanelTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
PanelTitle.displayName = "PanelTitle"

const PanelDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
)
PanelDescription.displayName = "PanelDescription"

const PanelActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2", className)}
      {...props}
    />
  )
)
PanelActions.displayName = "PanelActions"

function PanelLoadingState() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

export type PanelContentProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Use when there is no `PanelHeader` so top padding matches side padding.
   * When false (default), top padding is tuned for use below a header.
   */
  standalone?: boolean
}

const PanelContent = React.forwardRef<HTMLDivElement, PanelContentProps>(
  ({ className, standalone, children, ...props }, ref) => {
    const { variant, emptyMessage, errorMessage } = usePanelContext("PanelContent")

    const padding = standalone ? "p-6" : "px-6 pb-6 pt-4"

    let body: React.ReactNode

    if (variant === "loading") {
      body = children ?? <PanelLoadingState />
    } else if (variant === "empty") {
      body =
        children ??
        (emptyMessage !== undefined ? (
          emptyMessage
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
        ))
    } else if (variant === "error") {
      body =
        children ?? (
          <div
            role="alert"
            className={cn(
              "rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm",
              "text-destructive"
            )}
          >
            {errorMessage ?? "Something went wrong."}
          </div>
        )
    } else {
      body = children
    }

    return (
      <div ref={ref} className={cn(padding, className)} {...props}>
        {body}
      </div>
    )
  }
)
PanelContent.displayName = "PanelContent"

export {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelDescription,
  PanelActions,
  PanelContent,
  PanelLoadingState,
}
