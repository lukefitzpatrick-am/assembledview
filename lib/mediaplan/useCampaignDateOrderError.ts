"use client"

import { useEffect } from "react"
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form"

import { END_BEFORE_START_MESSAGE, endIsBeforeStart } from "@/lib/mediaplan/dateOrder"

/** Sets the end-date field error as soon as the start moves past the end. */
export function useCampaignDateOrderError<T extends FieldValues>(
  form: UseFormReturn<T>,
  start: unknown,
  end: unknown,
  field: FieldPath<T>,
): boolean {
  const outOfOrder = endIsBeforeStart(start, end)
  useEffect(() => {
    if (outOfOrder) {
      form.setError(field, { type: "dateOrder", message: END_BEFORE_START_MESSAGE })
      return
    }
    const current = form.getFieldState(field).error
    if (
      current?.type === "dateOrder" ||
      current?.message === END_BEFORE_START_MESSAGE
    ) {
      form.clearErrors(field)
    }
  }, [form, field, outOfOrder])
  return outOfOrder
}
