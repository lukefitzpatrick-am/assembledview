"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  displayMiAnswerText,
  formatQuestionAnswerMessage,
  isSkipAnswer,
  OTHER_OPTION,
  SKIP_ANSWER,
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

function isListedOptionOn(
  option: string,
  locked: boolean,
  confirmedAnswer: string | undefined,
  selected: string[],
  options: string[],
  type: ChatInterviewQuestion["type"],
): boolean {
  if (!locked) return selected.includes(option)
  if (isSkipAnswer(confirmedAnswer ?? "")) return false
  const display = displayMiAnswerText(confirmedAnswer ?? "")
  const listed = new Set(options)
  if (option === OTHER_OPTION) {
    if (type === "multichoice") {
      return display
        .split(",")
        .map((part) => part.trim())
        .some((part) => part.length > 0 && !listed.has(part))
    }
    return display.length > 0 && !listed.has(display)
  }
  if (type === "multichoice") {
    return display
      .split(",")
      .map((part) => part.trim())
      .includes(option)
  }
  return display === option
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
  const otherOn = selected.includes(OTHER_OPTION)
  const showOtherInput =
    question.type === "choice" || question.type === "multichoice"
      ? locked
        ? isListedOptionOn(
            OTHER_OPTION,
            true,
            question.confirmedAnswer,
            selected,
            options,
            question.type,
          )
        : otherOn
      : false
  const canConfirm = locked
    ? false
    : question.type === "text"
      ? freeText.trim().length > 0
      : otherOn
        ? freeText.trim().length > 0
        : selected.length > 0
  const skipped = locked && isSkipAnswer(question.confirmedAnswer ?? "")

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

  function handleSkip() {
    if (locked || disabled) return
    const answerText = formatQuestionAnswerMessage(
      question.id,
      question.type,
      [SKIP_ANSWER],
      SKIP_ANSWER,
    )
    if (!answerText) return
    onConfirm(answerText)
  }

  const listedOptions = options.filter((option) => option !== OTHER_OPTION)
  const lockedDisplay = displayMiAnswerText(question.confirmedAnswer ?? "")

  return (
    <div className="mr-auto flex w-full min-w-0 max-w-full flex-col gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-e1">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">
          Question {question.index} of {question.total}
          {locked ? (skipped ? " · skipped" : " · answered") : question.selected?.length ? " · defaults pre-selected" : null}
        </p>
        <p className="text-sm font-medium break-words text-foreground">{question.text}</p>
      </div>

      {question.type === "text" ? (
        <Input
          value={locked ? lockedDisplay : freeText}
          onChange={(e) => setFreeText(e.target.value)}
          disabled={locked || disabled}
          placeholder="Type your answer"
          className="rounded-input"
        />
      ) : null}

      {question.type === "choice" ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.text}>
          {listedOptions.map((option) => {
            const isOn = isListedOptionOn(
              option,
              locked,
              question.confirmedAnswer,
              selected,
              listedOptions,
              "choice",
            )
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isOn}
                disabled={locked || disabled}
                onClick={() => selectChoice(option)}
                className={cn(
                  "interactive-tint rounded-input border px-3 py-2 text-left text-sm break-words transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                  isOn
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-foreground hover:bg-table-row-hover",
                )}
              >
                {option}
              </button>
            )
          })}
          <button
            type="button"
            role="radio"
            aria-checked={
              locked
                ? isListedOptionOn(
                    OTHER_OPTION,
                    true,
                    question.confirmedAnswer,
                    selected,
                    listedOptions,
                    "choice",
                  )
                : otherOn
            }
            disabled={locked || disabled}
            onClick={() => selectChoice(OTHER_OPTION)}
            className={cn(
              "interactive-tint rounded-input border px-3 py-2 text-left text-sm break-words transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
              (locked
                ? isListedOptionOn(
                    OTHER_OPTION,
                    true,
                    question.confirmedAnswer,
                    selected,
                    listedOptions,
                    "choice",
                  )
                : otherOn)
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-foreground hover:bg-table-row-hover",
            )}
          >
            {OTHER_OPTION}
          </button>
        </div>
      ) : null}

      {question.type === "multichoice" ? (
        <div className="flex flex-col gap-2">
          {listedOptions.map((option) => {
            const isOn = isListedOptionOn(
              option,
              locked,
              question.confirmedAnswer,
              selected,
              listedOptions,
              "multichoice",
            )
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
                <span className="min-w-0 break-words">{option}</span>
              </label>
            )
          })}
          <label
            className={cn(
              "flex items-start gap-3 rounded-input border border-border px-3 py-2 text-sm text-foreground",
              locked || disabled ? "opacity-60" : "hover:bg-table-row-hover",
            )}
          >
            <Checkbox
              checked={
                locked
                  ? isListedOptionOn(
                      OTHER_OPTION,
                      true,
                      question.confirmedAnswer,
                      selected,
                      listedOptions,
                      "multichoice",
                    )
                  : otherOn
              }
              disabled={locked || disabled}
              onCheckedChange={(value) => toggleMulti(OTHER_OPTION, value === true)}
              className="mt-0.5"
            />
            <span className="min-w-0 break-words">{OTHER_OPTION}</span>
          </label>
        </div>
      ) : null}

      {showOtherInput ? (
        <Input
          value={locked ? lockedDisplay : freeText}
          onChange={(e) => setFreeText(e.target.value)}
          disabled={locked || disabled}
          placeholder="Type your answer"
          className="rounded-input"
        />
      ) : null}

      {locked ? (
        skipped ? (
          <p className="text-xs text-muted-foreground">Skipped</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Confirmed:{" "}
            <span className="text-foreground">{lockedDisplay}</span>
          </p>
        )
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={handleSkip}
          >
            Skip
          </Button>
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
