"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import type { ViewState } from "@/lib/ui/viewState"

export type ViewStateBoundaryProps<T> = {
  state: ViewState<T>
  children: (data: T) => React.ReactNode
  /** LoadingState row count. */
  loadingRows?: number
  emptyTitle?: React.ReactNode
  emptyMessage?: React.ReactNode
  emptyAction?: React.ReactNode
  filteredEmptyTitle?: React.ReactNode
  filteredEmptyMessage?: React.ReactNode
  errorTitle?: React.ReactNode
  className?: string
}

/**
 * Renders exactly one of: skeleton / ErrorState / EmptyState / filtered EmptyState
 * with Clear filters / children. Mutually exclusive by ViewState construction.
 */
export function ViewStateBoundary<T>({
  state,
  children,
  loadingRows = 4,
  emptyTitle = "No data yet",
  emptyMessage = "There is nothing to show for this view.",
  emptyAction,
  filteredEmptyTitle = "No matches",
  filteredEmptyMessage = "Nothing matches the current filters.",
  errorTitle = "Something went wrong",
  className,
}: ViewStateBoundaryProps<T>) {
  switch (state.status) {
    case "loading":
      return (
        <div data-view-state="loading" className={className}>
          <LoadingState rows={loadingRows} />
        </div>
      )
    case "error":
      return (
        <div data-view-state="error" className={className}>
          <ErrorState
            title={errorTitle}
            message={state.message}
            onRetry={state.retry}
          />
        </div>
      )
    case "empty":
      return (
        <div data-view-state="empty" className={className}>
          <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
        </div>
      )
    case "filtered-empty":
      return (
        <div data-view-state="filtered-empty" className={className}>
          <EmptyState
            title={filteredEmptyTitle}
            message={filteredEmptyMessage}
            action={
              <Button type="button" variant="outline" size="sm" onClick={state.clear}>
                Clear filters
              </Button>
            }
          />
        </div>
      )
    case "ready":
      return (
        <div data-view-state="ready" className={className}>
          {children(state.data)}
        </div>
      )
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}
