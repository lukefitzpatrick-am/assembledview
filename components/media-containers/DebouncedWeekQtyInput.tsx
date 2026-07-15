"use client"

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type FocusEvent,
} from "react"

import { Input } from "@/components/ui/input"

export const EXPERT_WEEK_QTY_DEBOUNCE_MS = 250

/**
 * Pure helper (testable): when the parent committed value changes while the
 * input is not dirty, adopt it. While dirty, ignore external echoes so typing
 * is not jerky.
 */
export function nextDraftFromCommitted(
  dirty: boolean,
  draft: string,
  committed: string
): string | null {
  if (dirty) return null
  if (draft === committed) return null
  return committed
}

type DebouncedWeekQtyInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "defaultValue"
> & {
  /** Last committed value from grid row state (Apply/serialize source of truth). */
  committedValue: string
  /** Writes committed row state — called on debounce flush and blur. */
  onCommit: (value: string) => void
  debounceMs?: number
  ref?: React.Ref<HTMLInputElement>
}

/**
 * Uncontrolled-while-typing week quantity cell: local draft updates every
 * keystroke; parent row state only updates after {@link debounceMs} idle or
 * blur. Apply / serialize always read committed values, never the draft.
 */
export function DebouncedWeekQtyInput({
  committedValue,
  onCommit,
  debounceMs = EXPERT_WEEK_QTY_DEBOUNCE_MS,
  onBlur,
  ref,
  ...inputProps
}: DebouncedWeekQtyInputProps) {
  const [draft, setDraft] = useState(committedValue)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const committedRef = useRef(committedValue)
  committedRef.current = committedValue

  useEffect(() => {
    const next = nextDraftFromCommitted(
      dirtyRef.current,
      draftRef.current,
      committedValue
    )
    if (next !== null) {
      setDraft(next)
      draftRef.current = next
    }
  }, [committedValue])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    dirtyRef.current = false
    const next = draftRef.current
    if (next !== committedRef.current) {
      onCommitRef.current(next)
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    dirtyRef.current = true
    setDraft(text)
    draftRef.current = text
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      dirtyRef.current = false
      const next = draftRef.current
      if (next !== committedRef.current) {
        onCommitRef.current(next)
      }
    }, debounceMs)
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    flush()
    onBlur?.(e)
  }

  return (
    <Input
      {...inputProps}
      ref={ref}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  )
}
