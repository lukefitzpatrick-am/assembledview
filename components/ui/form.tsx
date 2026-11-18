"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  ControllerProps,
  FieldErrors,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
  type UseFormReturn,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { invalidFieldSummary } from "@/lib/ui/invalidFields"
import { announce } from "@/components/ui/announcer"
import { Label } from "@/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message) : children

  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

/**
 * How a form shows errors (B58). Each field's `FormMessage` sits under it,
 * linked by `aria-describedby`, with `aria-invalid` on the control. Pass this
 * as `handleSubmit`'s second argument: a failed submit says one summary
 * through the announcer, and react-hook-form moves focus to the first invalid
 * field (`shouldFocusError`, on by default). Never a toast for a field error.
 */
function announceInvalid(labels?: Readonly<Record<string, string>>) {
  return (errors: FieldErrors) => {
    announce(invalidFieldSummary(errors, labels), "assertive")
  }
}

/**
 * A server refusal that names fields (a 409 or 422 with `fieldErrors`): each
 * message goes under its field, focus goes to the first, one summary is
 * announced. True when there was a field error to show; the caller then shows
 * no toast for it. A form that saves under a saving window also passes
 * `focusServerErrorOnClose(form)` to that window: its focus trap refuses the
 * field while it is open.
 */
function showServerFieldErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, "setError">,
  fieldErrors: Partial<Record<string, string>>,
  labels?: Readonly<Record<string, string>>,
): boolean {
  const named = Object.entries(fieldErrors).filter((entry): entry is [string, string] => Boolean(entry[1]))
  if (named.length === 0) return false
  named.forEach(([name, message], index) => {
    form.setError(name as FieldPath<T>, { type: "server", message }, { shouldFocus: index === 0 })
  })
  announce(invalidFieldSummary(Object.fromEntries(named.map(([name, message]) => [name, { message }])), labels), "assertive")
  return true
}

/**
 * The saving window's `onCloseAutoFocus` for a form that uses
 * `showServerFieldErrors` (B58fix). The refusal lands while the window is open,
 * so focus goes to the first server error once it has closed, not back to
 * Save. A save that did not end in a server field error closes as usual.
 */
function focusServerErrorOnClose<T extends FieldValues>(form: Pick<UseFormReturn<T>, "formState" | "setFocus">) {
  return (event: Event) => {
    const first = Object.entries(form.formState.errors).find(([, error]) => error?.type === "server")?.[0]
    if (!first) return
    event.preventDefault()
    form.setFocus(first as FieldPath<T>)
  }
}

/**
 * The same summary as text by the Save button, after a failed submit, for a
 * form whose invalid field can be off screen or hidden. Not a live region:
 * `announceInvalid` says it once.
 */
function FormErrorSummary({
  labels,
  className,
}: {
  labels?: Readonly<Record<string, string>>
  className?: string
}) {
  const { formState } = useFormContext()
  const text = formState.submitCount > 0 ? invalidFieldSummary(formState.errors, labels) : ""
  if (!text) return null
  return (
    <p data-form-error-summary="" className={cn("text-sm font-medium text-destructive", className)}>
      {text}
    </p>
  )
}

export {
  announceInvalid,
  FormErrorSummary,
  focusServerErrorOnClose,
  showServerFieldErrors,
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
