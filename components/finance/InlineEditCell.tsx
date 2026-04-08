"use client"

import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type InlineEditCellRenderArgs<T> = {
  value: T
  setValue: (next: T) => void
  dirty: boolean
  discard: () => void
}

export function InlineEditActions({
  busy,
  onPublish,
  onDiscard,
}: {
  busy?: boolean
  onPublish: () => void
  onDiscard: () => void
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 px-2 text-xs"
        disabled={busy}
        onClick={() => void onPublish()}
      >
        Publish
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={busy}
        onClick={onDiscard}
      >
        Discard
      </Button>
    </div>
  )
}

export type InlineEditCellProps<T> = {
  published: T
  /** Default: JSON.stringify equality (fine for primitives). */
  isEqual?: (a: T, b: T) => boolean
  children: (ctx: InlineEditCellRenderArgs<T>) => React.ReactNode
  onPublish: (next: T) => Promise<void> | void
  className?: string
  /**
   * When false, Publish/Discard are omitted — use when a parent aggregates
   * multiple cells into one row-level publish bar.
   */
  showActions?: boolean
}

export function InlineEditCell<T>({
  published,
  isEqual,
  children,
  onPublish,
  className,
  showActions = true,
}: InlineEditCellProps<T>) {
  const [draft, setDraft] = useState<T | null>(null)
  const value = draft ?? published

  const isDirty = useMemo(() => {
    if (draft === null) return false
    return isEqual ? !isEqual(draft, published) : JSON.stringify(draft) !== JSON.stringify(published)
  }, [draft, isEqual, published])

  const discard = useCallback(() => setDraft(null), [])
  const setValue = useCallback((next: T) => setDraft(next), [])
  const [busy, setBusy] = useState(false)

  const publish = useCallback(async () => {
    if (!isDirty) return
    setBusy(true)
    try {
      await onPublish(value)
      setDraft(null)
    } finally {
      setBusy(false)
    }
  }, [isDirty, onPublish, value])

  return (
    <div
      className={cn(
        "min-w-0",
        isDirty && "rounded-md px-0.5 ring-2 ring-amber-500/35 ring-offset-1 ring-offset-background",
        className
      )}
    >
      {children({ value, setValue, dirty: isDirty, discard })}
      {showActions && isDirty ? <InlineEditActions busy={busy} onPublish={() => void publish()} onDiscard={discard} /> : null}
    </div>
  )
}
