"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchRootProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "aria-labelledby" | "onChange" | "role" | "type"
> & {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** Accessible name is required: provide exactly one of `aria-label` or `aria-labelledby`. */
export type SwitchProps =
  | (SwitchRootProps & { "aria-label": string; "aria-labelledby"?: never })
  | (SwitchRootProps & { "aria-labelledby": string; "aria-label"?: never })

/**
 * Switch primitive.
 *
 * Intentionally does **not** use `@radix-ui/react-switch` Root: that package
 * composes an inline `(node) => setButton(node)` into `useComposedRefs`, so
 * React 19 ref detach/attach during channel-container mount churn calls
 * setState inside commitMutationEffects → "Maximum update depth exceeded"
 * (Radix `src/switch.tsx` — see radix-ui/primitives#3963). DOM node is held
 * in a ref only; the composed ref callback identity is stable.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked,
      defaultChecked,
      onCheckedChange,
      disabled,
      onClick,
      ...props
    },
    forwardedRef
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
      () => Boolean(defaultChecked)
    )
    const isControlled = checked !== undefined
    const isChecked = isControlled ? Boolean(checked) : uncontrolledChecked

    const forwardedRefRef = React.useRef(forwardedRef)
    forwardedRefRef.current = forwardedRef

    // Stable ref callback — never recreate on render (React 19 ref cleanup).
    // No node-in-useState: the DOM node is not needed for render (unlike Radix
    // Switch's setButton → isFormControl / BubbleInput path).
    const setRefs = React.useCallback((node: HTMLButtonElement | null) => {
      const ref = forwardedRefRef.current
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ;(ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
      }
    }, [])

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        data-state={isChecked ? "checked" : "unchecked"}
        data-disabled={disabled ? "" : undefined}
        disabled={disabled}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill border border-border transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-[var(--fill-track)]",
          className
        )}
        {...props}
        ref={setRefs}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented || disabled) return
          const next = !isChecked
          if (!isControlled) setUncontrolledChecked(next)
          onCheckedChange?.(next)
        }}
      >
        <span
          aria-hidden="true"
          data-state={isChecked ? "checked" : "unchecked"}
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-pill bg-card shadow-e1 ring-0 transition-transform duration-200 ease-out data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
