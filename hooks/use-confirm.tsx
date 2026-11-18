"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"

/**
 * One way to ask a question (B57). Replaces the browser's `confirm()` and
 * `alert()`, which block the page, cannot be styled and some screen readers
 * read badly. The window is the shared `AlertDialog`: focus is trapped,
 * Escape answers no, and focus goes back to the control that opened it.
 *
 *   const { confirm, notice, confirmDialog } = useConfirm()
 *   if (!(await confirm({ title, description, confirmLabel, tone }))) return
 *   await notice({ title, description })
 *   // render {confirmDialog} once in the component
 *
 * Nothing after the `await` runs before the answer. Cancel, Escape, a second
 * question and unmounting all answer no.
 */
export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  /** Default "Continue". Name the action: "Delete", "Save anyway". */
  confirmLabel?: string
  /** Default "Cancel". */
  cancelLabel?: string
  /** `destructive` for deletes and anything that cannot be undone. */
  tone?: "default" | "destructive"
}

/** A message that waits to be read (what `alert()` did). */
export type NoticeOptions = {
  title: string
  description?: React.ReactNode
  /** Default "OK". */
  closeLabel?: string
}

type Question =
  | ({ kind: "confirm" } & ConfirmOptions)
  | ({ kind: "notice" } & NoticeOptions)

export function useConfirm() {
  const [question, setQuestion] = React.useState<Question | null>(null)
  const [open, setOpen] = React.useState(false)
  const answer = React.useRef<((yes: boolean) => void) | null>(null)
  const actionRef = React.useRef<HTMLButtonElement>(null)

  const settle = React.useCallback((yes: boolean) => {
    const resolve = answer.current
    answer.current = null
    setOpen(false)
    resolve?.(yes)
  }, [])

  const ask = React.useCallback((next: Question) => {
    answer.current?.(false)
    return new Promise<boolean>((resolve) => {
      answer.current = resolve
      setQuestion(next)
      setOpen(true)
    })
  }, [])

  React.useEffect(() => () => answer.current?.(false), [])

  const confirm = React.useCallback((options: ConfirmOptions) => ask({ kind: "confirm", ...options }), [ask])
  const notice = React.useCallback(
    async (options: NoticeOptions) => {
      await ask({ kind: "notice", ...options })
    },
    [ask],
  )

  const confirmDialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false)
      }}
    >
      <AlertDialogContent
        {...(question?.description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          // A notice has no Cancel for Radix to focus: start on its one button.
          if (question?.kind !== "notice") return
          event.preventDefault()
          actionRef.current?.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{question?.title}</AlertDialogTitle>
          {question?.description ? (
            <AlertDialogDescription className="whitespace-pre-line">{question.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {question?.kind === "confirm" ? (
            <AlertDialogCancel>{question.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          ) : null}
          <AlertDialogAction
            ref={actionRef}
            className={
              question?.kind === "confirm" && question.tone === "destructive"
                ? buttonVariants({ variant: "destructive" })
                : undefined
            }
            onClick={() => settle(true)}
          >
            {question?.kind === "notice" ? (question.closeLabel ?? "OK") : (question?.confirmLabel ?? "Continue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, notice, confirmDialog }
}
