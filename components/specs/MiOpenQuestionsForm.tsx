"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  initialAnswersForQuestions,
  mergeMiAnswers,
} from "@/lib/specs/miAutoAnswers"
import type { MiAnswer, MiOpenQuestion } from "@/lib/specs/resolve"
import { cn } from "@/lib/utils"

export type MiOpenQuestionsFormProps = {
  openQuestions: MiOpenQuestion[]
  initialAnswers?: MiAnswer[]
  /** Called with initialAnswers merged with the user's form values. */
  onConfirm: (answers: MiAnswer[]) => void
  onCancel?: () => void
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  className?: string
}

function splitMulti(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: MiOpenQuestion
  value: string
  onChange: (next: string) => void
}) {
  const options = question.options ?? []

  if (question.type === "multichoice" && options.length > 0) {
    const selected = new Set(splitMulti(value))
    return (
      <div className="space-y-2">
        {options.map((option) => {
          const checked = selected.has(option)
          return (
            <label
              key={option}
              className="interactive-tint flex cursor-pointer items-center gap-2 rounded-input border border-border px-2 py-1.5 text-sm"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => {
                  const copy = new Set(selected)
                  if (next === true) copy.add(option)
                  else copy.delete(option)
                  onChange([...copy].join(", "))
                }}
              />
              <span>{option}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if ((question.type === "choice" || question.type === "dimensions") && options.length > 0) {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (question.type === "text" || question.type === "dimensions") {
    return (
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="resize-none"
      />
    )
  }

  return (
    <Input value={value} onChange={(event) => onChange(event.target.value)} />
  )
}

/**
 * Standalone MI open-questions mini-form.
 * Prefills from initialAnswers / question.selected; onConfirm returns merged answers.
 */
export function MiOpenQuestionsForm({
  openQuestions,
  initialAnswers = [],
  onConfirm,
  onCancel,
  confirmLabel = "Download MI",
  cancelLabel = "Cancel",
  busy = false,
  className,
}: MiOpenQuestionsFormProps) {
  const seeded = useMemo(
    () => initialAnswersForQuestions(openQuestions, initialAnswers),
    [openQuestions, initialAnswers],
  )
  const [values, setValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const answer of seeded) map[answer.questionId] = answer.answer
    return map
  })

  const allAnswered = openQuestions.every((question) => {
    const raw = values[question.id]?.trim() ?? ""
    return raw.length > 0
  })

  function setAnswer(questionId: string, answer: string) {
    setValues((prev) => ({ ...prev, [questionId]: answer }))
  }

  function handleConfirm() {
    const fromForm: MiAnswer[] = openQuestions.flatMap((question) => {
      const answer = values[question.id]?.trim() ?? ""
      return answer ? [{ questionId: question.id, answer }] : []
    })
    onConfirm(mergeMiAnswers(initialAnswers, fromForm))
  }

  if (openQuestions.length === 0) return null

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">A few spec details</p>
        <p className="text-xs text-muted-foreground">
          Answer the remaining questions so SPECS columns fill completely. Defaults are
          pre-filled where we could infer them.
        </p>
      </div>

      <div className="max-h-[min(50vh,28rem)] space-y-4 overflow-y-auto pr-1">
        {openQuestions.map((question) => (
          <div key={question.id} className="space-y-1.5 rounded-card border border-border bg-card p-3">
            <Label className="text-sm leading-snug text-foreground">
              {question.question}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {question.rowRef.displayName}
            </p>
            <QuestionField
              question={question}
              value={values[question.id] ?? ""}
              onChange={(next) => setAnswer(question.id, next)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button type="button" disabled={busy || !allAnswered} onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
