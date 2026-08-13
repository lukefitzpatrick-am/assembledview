import type { MiAnswer } from "./resolve"

export type StoredMiResolution = {
  answers: MiAnswer[]
  updatedAt: string
  updatedBy?: string
}

function isMiAnswer(value: unknown): value is MiAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const rec = value as Record<string, unknown>
  return typeof rec.questionId === "string" && typeof rec.answer === "string"
}

/** Persist interview answers only — never a full MiResolveResult. */
export function parseMiResolution(value: unknown): StoredMiResolution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  if (!Array.isArray(rec.answers)) return null
  const answers = rec.answers.filter(isMiAnswer)
  if (answers.length === 0) return null
  return {
    answers,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : "",
    ...(typeof rec.updatedBy === "string" ? { updatedBy: rec.updatedBy } : {}),
  }
}

export function mergeMiResolution(
  existing: StoredMiResolution | null,
  incoming: MiAnswer[],
  updatedBy: string,
  updatedAt: string,
): StoredMiResolution {
  const byId = new Map<string, MiAnswer>()
  for (const answer of existing?.answers ?? []) {
    byId.set(answer.questionId, answer)
  }
  for (const answer of incoming) {
    byId.set(answer.questionId, answer)
  }
  return {
    answers: [...byId.values()],
    updatedAt,
    updatedBy,
  }
}
