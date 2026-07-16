import type { MiAnswer, MiOpenQuestion } from "./resolve"

export type SearchMiFormat = "rsa" | "pmax"

/**
 * Pick the Google Ads format option for a Search MI open question.
 * Returns the exact option string from the question, or null when nothing matches.
 */
export function matchSearchFormatOption(
  question: MiOpenQuestion,
  format: SearchMiFormat,
): string | null {
  if (question.field !== "format") return null
  const options = (question.options ?? []).filter(
    (option) => option.trim().toLowerCase() !== "none of these",
  )
  if (options.length === 0) return null

  if (format === "rsa") {
    return options.find((option) => /responsive search|\(rsa\)/i.test(option)) ?? null
  }
  return options.find((option) => /performance max/i.test(option)) ?? null
}

/**
 * Build Layer-1 auto-answers for the Search Build-MI flow.
 * Uses each open question's exact `id` (e.g. format:<line_item_id>) — never invents IDs
 * or option strings. Unmatched format questions are omitted for MiOpenQuestionsForm.
 */
export function buildSearchMiAutoAnswers(input: {
  lineItemId: string
  format: SearchMiFormat
  openQuestions: MiOpenQuestion[]
}): MiAnswer[] {
  const answers: MiAnswer[] = []
  const lineId = input.lineItemId.trim()

  for (const question of input.openQuestions) {
    if (question.field !== "format") continue
    if (question.rowRef.line_item_id !== lineId) continue
    const matched = matchSearchFormatOption(question, input.format)
    if (matched) {
      answers.push({ questionId: question.id, answer: matched })
    }
  }

  return answers
}
