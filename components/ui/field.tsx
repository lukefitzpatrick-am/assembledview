"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type FieldControlProps = {
  id: string
  /** Always set so icon-only / Radix controls (e.g. Switch) get a typed accessible name. */
  "aria-labelledby": string
  required?: boolean
  "aria-required"?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

type FieldProps = {
  label: React.ReactNode
  required?: boolean
  error?: string
  description?: React.ReactNode
  className?: string
  labelClassName?: string
  /** Vertical (default) stacks label above control; horizontal places control beside label (e.g. Switch rows). */
  orientation?: "vertical" | "horizontal"
  children: React.ReactElement | ((props: FieldControlProps) => React.ReactNode)
}

/**
 * Owns label↔control association so accessible names / required / error wiring cannot be omitted.
 * Visual asterisk is paired with real `required` + `aria-required` on the control.
 */
function Field({
  label,
  required,
  error,
  description,
  className,
  labelClassName,
  orientation = "vertical",
  children,
}: FieldProps) {
  const reactId = React.useId()
  const controlId = `${reactId}-control`
  const labelId = `${reactId}-label`
  const errorId = `${reactId}-error`
  const descriptionId = `${reactId}-description`

  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ")

  const controlProps: FieldControlProps = {
    id: controlId,
    "aria-labelledby": labelId,
    ...(required ? { required: true, "aria-required": true } : {}),
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  }

  const control =
    typeof children === "function"
      ? children(controlProps)
      : React.cloneElement(children, {
          ...(children.props as object),
          ...controlProps,
        })

  const labelNode = (
    <Label
      id={labelId}
      htmlFor={controlId}
      className={cn(
        orientation === "horizontal"
          ? "font-normal leading-snug min-w-0 flex-1 cursor-pointer"
          : "text-sm font-medium text-text-secondary",
        labelClassName
      )}
    >
      {label}
      {required ? (
        <span className="text-status-critical-fg" aria-hidden>
          {" "}
          *
        </span>
      ) : null}
    </Label>
  )

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        {control}
        <div className="min-w-0 flex-1">
          {labelNode}
          {description != null ? (
            <p id={descriptionId} className="text-[10px] text-muted-foreground">
              {description}
            </p>
          ) : null}
          {error ? (
            <p id={errorId} className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {labelNode}
      {control}
      {description != null ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { Field }
