"use client"

import * as React from "react"

import { announce } from "@/components/ui/announcer"
import { invalidFieldSummary } from "@/lib/ui/invalidFields"

/**
 * Field errors for a small form that does not use react-hook-form (B58), the
 * same way `announceInvalid` shows them: each message under its field, linked
 * by `aria-describedby`, `aria-invalid` on the control, focus on the first
 * invalid field and one summary announced. `labels` gives the form order.
 *
 *   const errors = useFieldErrors({ name: "Name" })
 *   if (!errors.check({ name: name.trim() ? undefined : "Name is required" })) return
 *   <Label htmlFor={errors.control("name").id}>Name</Label>
 *   <Input {...errors.control("name")} onChange={(e) => { errors.clear("name"); ... }} />
 *   {errors.message("name")}
 *
 * The control takes the id, so the label points at it and focus finds it.
 */
export function useFieldErrors<K extends string>(labels: Readonly<Record<K, string>>) {
  const id = React.useId()
  const [errors, setErrors] = React.useState<Partial<Record<K, string>>>({})
  const controlId = (key: K) => `${id}-${key}`
  const messageId = (key: K) => `${id}-${key}-error`

  /** True when nothing is wrong. Otherwise shows every message, focuses the first field, says one summary. */
  const check = (found: Partial<Record<K, string | undefined>>): boolean => {
    const named = (Object.keys(labels) as K[]).filter((key) => found[key])
    setErrors(Object.fromEntries(named.map((key) => [key, found[key]])) as Partial<Record<K, string>>)
    if (named.length === 0) return true
    document.getElementById(controlId(named[0]))?.focus()
    announce(
      invalidFieldSummary(Object.fromEntries(named.map((key) => [key, { message: found[key] }])), labels),
      "assertive",
    )
    return false
  }

  /** Spread on the control. */
  const control = (key: K) => ({
    id: controlId(key),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? messageId(key) : undefined,
  })

  /** The message, under the control. */
  const message = (key: K) =>
    errors[key] ? (
      <p id={messageId(key)} className="text-sm font-medium text-destructive">
        {errors[key]}
      </p>
    ) : null

  /** Clears one field's message (call when it changes). Stable, so an effect can call it. */
  const clear = React.useCallback(
    (key: K) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev)),
    [],
  )

  return { check, control, message, clear }
}
