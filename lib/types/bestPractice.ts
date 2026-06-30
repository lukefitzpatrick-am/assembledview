import { z } from "zod"

export type BestPracticeSection = {
  heading: string
  items: string[]
}

export type BestPractice = {
  version: 1
  sections: BestPracticeSection[]
} | null

export const bestPracticeSectionSchema: z.ZodType<BestPracticeSection> = z.object({
  heading: z.string().trim().default(""),
  items: z.array(z.string()).default([]),
})

export const bestPracticeSchema = z
  .object({
    version: z.literal(1),
    sections: z.array(bestPracticeSectionSchema),
  })
  .nullable() satisfies z.ZodType<BestPractice>

export const EMPTY_BEST_PRACTICE: BestPractice = { version: 1, sections: [] }

export function isEmptyBestPractice(bp: BestPractice | undefined): boolean {
  if (!bp || !Array.isArray(bp.sections)) return true
  return !bp.sections.some(
    (section) =>
      (section.heading?.trim() ?? "") !== "" ||
      (section.items ?? []).some((item) => item.trim() !== ""),
  )
}

/** Coerce unknown/legacy json into a valid BestPractice (or null). */
export function normalizeBestPractice(raw: unknown): BestPractice {
  const parsed = bestPracticeSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  return null
}
