import type { ChatInterviewQuestion } from "@/lib/ava/types"

/** Build a chat question card payload (display/input sugar for the MI interview). */
export function toChatInterviewQuestion(input: {
  id: string
  text: string
  type: "choice" | "multichoice" | "text" | "dimensions"
  options?: string[]
  selected?: string[]
  index: number
  total: number
}): ChatInterviewQuestion {
  const type: ChatInterviewQuestion["type"] =
    input.type === "multichoice"
      ? "multichoice"
      : input.type === "choice"
        ? "choice"
        : "text"

  const question: ChatInterviewQuestion = {
    kind: "question",
    id: input.id,
    text: input.text,
    type,
    index: input.index,
    total: input.total,
  }
  if (input.options?.length) question.options = [...input.options]
  if (input.selected?.length) question.selected = [...input.selected]
  return question
}

export function isChatInterviewQuestion(value: unknown): value is ChatInterviewQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    v.kind === "question" &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.text === "string" &&
    v.text.length > 0 &&
    (v.type === "choice" || v.type === "multichoice" || v.type === "text") &&
    typeof v.index === "number" &&
    Number.isFinite(v.index) &&
    typeof v.total === "number" &&
    Number.isFinite(v.total)
  )
}

export function coerceChatInterviewQuestions(
  value: unknown,
): ChatInterviewQuestion[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const out = value.filter(isChatInterviewQuestion)
  return out.length > 0 ? out : undefined
}

/** Plain-text answer body from a confirmed card selection (no question id). */
export function formatQuestionAnswerText(
  type: ChatInterviewQuestion["type"],
  values: string[],
  freeText: string,
): string {
  if (type === "text") return freeText.trim()
  return values.map((v) => v.trim()).filter(Boolean).join(", ")
}

const MI_ANSWER_TAG = /^\[mi:([^\]]+)\]\s*/i

/**
 * User message sent on Confirm — embeds questionId so the next turn can call
 * start_mi_interview({ answers }) without relying on dropped tool-result history.
 */
export function formatQuestionAnswerMessage(
  questionId: string,
  type: ChatInterviewQuestion["type"],
  values: string[],
  freeText: string,
): string {
  const answer = formatQuestionAnswerText(type, values, freeText)
  if (!answer) return ""
  return `[mi:${questionId}] ${answer}`
}

/** Parse a Confirm message produced by formatQuestionAnswerMessage. */
export function parseMiAnswerMessage(
  content: string,
): { questionId: string; answer: string } | undefined {
  const match = MI_ANSWER_TAG.exec(content.trim())
  if (!match) return undefined
  const questionId = match[1]?.trim()
  const answer = content.trim().slice(match[0].length).trim()
  if (!questionId || !answer) return undefined
  return { questionId, answer }
}

/** Strip the [mi:id] prefix for chat bubbles / locked card labels. */
export function displayMiAnswerText(content: string): string {
  return content.trim().replace(MI_ANSWER_TAG, "").trim() || content.trim()
}
