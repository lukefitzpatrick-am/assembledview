"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  displayMiAnswerText,
  formatQuestionAnswerMessage,
} from "@/lib/ava/chatInterviewQuestion"
import type { ChatInterviewQuestion } from "@/lib/ava/types"

export type ChatQuestionCardState = ChatInterviewQuestion & {
  /** Set after Confirm — locks the card for history. */
  confirmedAnswer?: string
}

type ChatQuestionCardProps = {
  question: ChatQuestionCardState
  disabled?: boolean
  onConfirm: (answerText: string) => void
}

export function ChatQuestionCard({
  question,
  disabled = false,
  onConfirm,
}: ChatQuestionCardProps) {
  const locked = typeof question.confirmedAnswer === "string"
  const [selected, setSelected] = useState<string[]>(() =>
    question.selected?.length ? [...question.selected] : [],
  )
  const [freeText, setFreeText] = useState(() =>
    question.type === "text" && question.selected?.[0] ? question.selected[0] : "",
  )

  const options = question.options ?? []
  const canConfirm = locked
    ? false
    : question.type === "text"
      ? freeText.trim().length > 0
      : selected.length > 0

  function toggleMulti(option: string, checked: boolean) {
    if (locked || disabled) return
    setSelected((prev) =>
      checked ? (prev.includes(option) ? prev : [...prev, option]) : prev.filter((v) => v !== option),
    )
  }

  function selectChoice(option: string) {
    if (locked || disabled) return
    setSelected([option])
  }

  function handleConfirm() {
    if (locked || disabled || !canConfirm) return
    const answerText = formatQuestionAnswerMessage(
      question.id,
      question.type,
      selected,
      freeText,
    )
    if (!answerText) return
    onConfirm(answerText)
  }

  return (
    <div className="mr-auto flex w-full max-w-[90%] flex-col gap-3 rounded-lg border border-border bg-background px-3 py-3 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">
          Question {question.index} of {question.total}
          {locked ? " · answered" : question.selected?.length ? " · defaults pre-selected" : null}
        </p>
        <p className="text-sm font-medium text-foreground">{question.text}</p>
      </div>

      {question.type === "text" ? (
        <Input
          value={locked ? displayMiAnswerText(question.confirmedAnswer ?? freeText) : freeText}
          onChange={(e) => setFreeText(e.target.value)}
          disabled={locked || disabled}
          placeholder="Type your answer"
          className="rounded-input"
        />
      ) : null}

      {question.type === "choice" ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.text}>
          {options.map((option) => {
            const isOn = locked
              ? displayMiAnswerText(question.confirmedAnswer ?? "") === option
              : selected.includes(option)
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isOn}
                disabled={locked || disabled}
                onClick={() => selectChoice(option)}
                className={cn(
                  "interactive-tint rounded-input border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                  isOn
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-foreground hover:bg-table-row-hover",
                )}
              >
                {option}
              </button>
            )
          })}
        </div>
      ) : null}

      {question.type === "multichoice" ? (
        <div className="flex flex-col gap-2">
          {options.map((option) => {
            const isOn = locked
              ? displayMiAnswerText(question.confirmedAnswer ?? "")
                  .split(",")
                  .map((part) => part.trim())
                  .includes(option)
              : selected.includes(option)
            return (
              <label
                key={option}
                className={cn(
                  "flex items-start gap-3 rounded-input border border-border px-3 py-2 text-sm text-foreground",
                  locked || disabled ? "opacity-60" : "hover:bg-table-row-hover",
                )}
              >
                <Checkbox
                  checked={isOn}
                  disabled={locked || disabled}
                  onCheckedChange={(value) => toggleMulti(option, value === true)}
                  className="mt-0.5"
                />
                <span>{option}</span>
              </label>
            )
          })}
        </div>
      ) : null}

      {locked ? (
        <p className="text-xs text-muted-foreground">
          Confirmed:{" "}
          <span className="text-foreground">
            {displayMiAnswerText(question.confirmedAnswer ?? "")}
          </span>
        </p>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={disabled || !canConfirm}
            onClick={handleConfirm}
          >
            Confirm
          </Button>
        </div>
      )}
    </div>
  )
}
