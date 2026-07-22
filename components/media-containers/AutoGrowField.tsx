"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const CONTROL_LINE_PX = 32
const DEFAULT_MAX_ROWS = 12

function adjustTextareaHeight(
  el: HTMLTextAreaElement,
  maxRows: number = DEFAULT_MAX_ROWS
) {
  el.style.height = "auto"
  const maxHeight = CONTROL_LINE_PX * maxRows
  const nextHeight = Math.min(el.scrollHeight, maxHeight)
  el.style.height = `${nextHeight}px`
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
}

export type AutoGrowFieldProps = Omit<
  React.ComponentProps<"textarea">,
  "rows"
> & {
  /** When true, Enter blurs instead of inserting a newline (compact card fields). */
  singleLine?: boolean
  maxRows?: number
}

export const AutoGrowField = React.forwardRef<
  HTMLTextAreaElement,
  AutoGrowFieldProps
>(function AutoGrowField(
  {
    className,
    singleLine = false,
    maxRows = DEFAULT_MAX_ROWS,
    onInput,
    onKeyDown,
    value,
    defaultValue,
    ...props
  },
  ref
) {
  const innerRef = React.useRef<HTMLTextAreaElement>(null)

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  const syncHeight = React.useCallback(() => {
    const el = innerRef.current
    if (el) adjustTextareaHeight(el, maxRows)
  }, [maxRows])

  React.useLayoutEffect(() => {
    syncHeight()
  }, [value, defaultValue, syncHeight])

  return (
    <textarea
      ref={setRefs}
      rows={1}
      value={value}
      defaultValue={defaultValue}
      className={cn(
        "flex min-h-8 w-full resize-none rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-sm leading-normal transition-colors",
        "placeholder:text-muted-foreground focus:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "overflow-hidden [field-sizing:content]",
        className
      )}
      onInput={(e) => {
        adjustTextareaHeight(e.currentTarget, maxRows)
        onInput?.(e)
      }}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") {
          e.preventDefault()
          e.currentTarget.blur()
        }
        onKeyDown?.(e)
      }}
      {...props}
    />
  )
})
