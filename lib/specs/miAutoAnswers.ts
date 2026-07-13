import type { MiAnswer, MiOpenQuestion } from "./resolve"

export type MiCreativeMimeHint = "video" | "static" | "both"

/** Mockup platform tabs → placement family used to match format question options. */
export type MiMockupPlatform =
  | "facebook-feed"
  | "instagram-feed"
  | "instagram-story"
  | "tiktok"

export function creativeTypeFromMimes(mimes: string[]): MiCreativeMimeHint | null {
  const kinds = new Set<"video" | "static">()
  for (const mime of mimes) {
    const lower = mime.toLowerCase()
    if (lower.startsWith("video/")) kinds.add("video")
    else if (lower.startsWith("image/")) kinds.add("static")
  }
  if (kinds.size === 0) return null
  if (kinds.size === 2) return "both"
  return kinds.has("video") ? "video" : "static"
}

function placementFamily(formatName: string): string {
  const lower = formatName.toLowerCase()
  if (/performance max/.test(lower)) return "pmax"
  if (/responsive search|\(rsa\)/.test(lower)) return "rsa"
  if (/carousel/.test(lower)) return "carousel"
  if (/stories|story/.test(lower)) return "stories"
  if (/reels/.test(lower)) return "reels"
  if (/feed/.test(lower)) return "feed"
  if (/shorts/.test(lower)) return "shorts"
  if (/bumper/.test(lower)) return "bumper"
  if (/masthead/.test(lower)) return "masthead"
  if (/in-stream|instream/.test(lower)) return "in-stream"
  if (/tiktok/.test(lower)) return "tiktok"
  return `other:${formatName}`
}

export function platformPlacementFamily(platform: MiMockupPlatform): string {
  switch (platform) {
    case "facebook-feed":
    case "instagram-feed":
      return "feed"
    case "instagram-story":
      return "stories"
    case "tiktok":
      return "tiktok"
  }
}

/**
 * Pick format option name(s) from an open format question using the mockup platform.
 * Returns null when nothing matches — never invents option text or question IDs.
 */
export function matchFormatAnswerFromPlatform(
  question: MiOpenQuestion,
  platform: MiMockupPlatform,
  creativeType?: MiCreativeMimeHint | null,
): string | null {
  if (question.field !== "format") return null
  const options = (question.options ?? []).filter(
    (option) => option.trim().toLowerCase() !== "none of these",
  )
  if (options.length === 0) return null

  const family = platformPlacementFamily(platform)
  const familyMatches = options.filter((option) => {
    if (family === "tiktok") return /tiktok/i.test(option) || placementFamily(option) === "tiktok"
    return placementFamily(option) === family
  })
  if (familyMatches.length === 0) return null

  const preferVideo = creativeType === "video" || creativeType === "both"
  const preferStatic = creativeType === "static" || creativeType === "both"

  if (creativeType === "both" && question.type === "multichoice") {
    const video = familyMatches.filter((option) => /video/i.test(option))
    const staticOpts = familyMatches.filter(
      (option) => /static|image/i.test(option) && !/video/i.test(option),
    )
    const picked = [...video.slice(0, 1), ...staticOpts.slice(0, 1)]
    if (picked.length > 0) return picked.join(", ")
  }

  if (preferVideo) {
    const video = familyMatches.find((option) => /video/i.test(option))
    if (video) return video
  }
  if (preferStatic) {
    const staticOpt = familyMatches.find(
      (option) => /static|image/i.test(option) && !/video/i.test(option),
    )
    if (staticOpt) return staticOpt
  }

  // Prefer resolver pre-selected options that still match the family.
  const preselected = (question.selected ?? []).filter((name) => familyMatches.includes(name))
  if (preselected.length > 0) {
    return question.type === "multichoice" ? preselected.join(", ") : preselected[0]
  }

  return familyMatches[0]
}

/** Merge answers by questionId; later entries win. */
export function mergeMiAnswers(...groups: MiAnswer[][]): MiAnswer[] {
  const map = new Map<string, string>()
  for (const group of groups) {
    for (const answer of group) {
      if (answer.questionId && answer.answer) map.set(answer.questionId, answer.answer)
    }
  }
  return [...map.entries()].map(([questionId, answer]) => ({ questionId, answer }))
}

/**
 * Build Layer-1 auto-answers for the mockup Build-MI flow.
 * Always emits creative_type from mime when known. Format answers only when an
 * open format question exists and a platform family option matches.
 */
export function buildMockupMiAutoAnswers(input: {
  lineItemId: string
  mimeTypes: string[]
  platform: MiMockupPlatform
  openQuestions: MiOpenQuestion[]
}): MiAnswer[] {
  const answers: MiAnswer[] = []
  const creativeType = creativeTypeFromMimes(input.mimeTypes)
  if (creativeType) {
    answers.push({ questionId: `creative_type:${input.lineItemId}`, answer: creativeType })
  }

  for (const question of input.openQuestions) {
    if (question.field !== "format") continue
    if (question.rowRef.line_item_id !== input.lineItemId) continue
    const matched = matchFormatAnswerFromPlatform(question, input.platform, creativeType)
    if (matched) {
      answers.push({ questionId: question.id, answer: matched })
    }
  }

  return answers
}

/** Seed form values from initial answers + question.selected defaults. */
export function initialAnswersForQuestions(
  openQuestions: MiOpenQuestion[],
  initialAnswers: MiAnswer[] = [],
): MiAnswer[] {
  const byId = new Map(initialAnswers.map((answer) => [answer.questionId, answer.answer]))
  const seeded: MiAnswer[] = []
  for (const question of openQuestions) {
    const existing = byId.get(question.id) ?? byId.get(question.appliesTo)
    if (existing) {
      seeded.push({ questionId: question.id, answer: existing })
      continue
    }
    if (question.selected && question.selected.length > 0) {
      seeded.push({
        questionId: question.id,
        answer: question.type === "multichoice"
          ? question.selected.join(", ")
          : question.selected[0],
      })
    }
  }
  return seeded
}
