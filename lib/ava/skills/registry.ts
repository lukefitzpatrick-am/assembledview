/**
 * Assembled skill pack — typed registry over vendored Claude-side skill markdown.
 * Content under `lib/ava/skills/content/` is verbatim; edit Claude-side only.
 */

import fs from "node:fs"
import path from "node:path"

export const SKILL_INJECTION_BUDGET_CHARS = 24_000
export const MARKETING_BRAIN_ID = "assembled-marketing-brain"
export const DECISION_RULES_REF = "decision-rules.md"

export type AvaSkillReference = {
  name: string
  body: string
}

export type AvaSkillEntry = {
  id: string
  title: string
  /** Frontmatter description compressed to ≤60 words. */
  triggerSummary: string
  version: string
  body: string
  learnings: string
  references: AvaSkillReference[]
  chains?: typeof MARKETING_BRAIN_ID[]
  pairedTools: string[]
}

export type AvaSkillsVersion = {
  importedAt: string
  sourceZip: string
  skills: Record<string, string>
}

const COPY_PAIRED_TOOLS = [
  "get_client_details",
  "get_saved_audiences",
  "get_best_practice",
  "get_platform_specs",
] as const

/** Static metadata that is not in the markdown frontmatter. */
const SKILL_META: Record<
  string,
  {
    title: string
    chains?: typeof MARKETING_BRAIN_ID[]
    pairedTools: string[]
  }
> = {
  "assembled-marketing-brain": {
    title: "Assembled marketing brain",
    pairedTools: [],
  },
  "assembled-insight-commentary": {
    title: "Insight & delivery commentary",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: ["get_pacing_snapshot", "get_campaign_context"],
  },
  "assembled-audience-insight": {
    title: "Audience insight",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: ["get_saved_audiences", "get_methodology"],
  },
  "assembled-meta-copy": {
    title: "Meta copy",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: [...COPY_PAIRED_TOOLS],
  },
  "assembled-search-copy": {
    title: "Search copy",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: [...COPY_PAIRED_TOOLS],
  },
  "assembled-linkedin-copy": {
    title: "LinkedIn copy",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: [...COPY_PAIRED_TOOLS],
  },
  "assembled-video-scripts": {
    title: "Video scripts",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: [...COPY_PAIRED_TOOLS, "get_creative_assets"],
  },
  "assembled-presentations": {
    title: "Presentations (outline-only)",
    chains: [MARKETING_BRAIN_ID],
    pairedTools: ["get_campaign_context", "get_pacing_snapshot"],
  },
}

const EXPECTED_SKILL_IDS = Object.keys(SKILL_META)

export function skillsContentDir(): string {
  return path.join(process.cwd(), "lib", "ava", "skills", "content")
}

export function parseFrontmatter(raw: string): {
  name?: string
  description?: string
  version?: string
  body: string
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { body: raw }

  const fm = match[1]
  const body = match[2]
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const version = fm.match(/^\s*version:\s*(.+)$/m)?.[1]?.trim()

  let description: string | undefined
  const descMatch = fm.match(/^description:\s*([\s\S]*?)(?=\nmetadata:|\nname:|$)/m)
  if (descMatch) {
    let d = descMatch[1].trim()
    if (
      (d.startsWith('"') && d.endsWith('"')) ||
      (d.startsWith("'") && d.endsWith("'"))
    ) {
      d = d.slice(1, -1)
    }
    description = d.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim()
  }

  return { name, description, version, body }
}

/** Compress a description to ≤ maxWords (default 60). */
export function compressTriggerSummary(description: string, maxWords = 60): string {
  const words = description.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(" ")
  return `${words.slice(0, maxWords).join(" ")}…`
}

export function loadSkillsVersion(dir = skillsContentDir()): AvaSkillsVersion {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "VERSION.json"), "utf8"),
  ) as AvaSkillsVersion
}

function loadSkillFromDisk(id: string, dir: string): AvaSkillEntry {
  const meta = SKILL_META[id]
  if (!meta) throw new Error(`Unknown skill id: ${id}`)

  const skillDir = path.join(dir, id)
  const skillRaw = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8")
  const parsed = parseFrontmatter(skillRaw)
  if (!parsed.name) throw new Error(`${id}: SKILL.md missing name frontmatter`)
  if (!parsed.description) {
    throw new Error(`${id}: SKILL.md missing description frontmatter`)
  }
  if (!parsed.version) throw new Error(`${id}: SKILL.md missing version frontmatter`)
  if (parsed.name !== id) {
    throw new Error(`${id}: frontmatter name "${parsed.name}" does not match folder`)
  }

  const learningsPath = path.join(skillDir, "LEARNINGS.md")
  const learnings = fs.existsSync(learningsPath)
    ? fs.readFileSync(learningsPath, "utf8")
    : ""

  const references: AvaSkillReference[] = []
  const refDir = path.join(skillDir, "references")
  if (fs.existsSync(refDir)) {
    for (const file of fs.readdirSync(refDir).sort()) {
      if (!file.endsWith(".md")) continue
      references.push({
        name: file,
        body: fs.readFileSync(path.join(refDir, file), "utf8"),
      })
    }
  }

  return {
    id,
    title: meta.title,
    triggerSummary: compressTriggerSummary(parsed.description),
    version: parsed.version,
    body: parsed.body.trimStart(),
    learnings,
    references,
    chains: meta.chains,
    pairedTools: meta.pairedTools,
  }
}

let cachedRegistry: AvaSkillEntry[] | null = null

/**
 * Load all 8 skills. Cached after first successful load in-process.
 */
export function loadSkillRegistry(dir = skillsContentDir()): AvaSkillEntry[] {
  if (cachedRegistry && dir === skillsContentDir()) return cachedRegistry

  const entries: AvaSkillEntry[] = []
  for (const id of EXPECTED_SKILL_IDS) {
    entries.push(loadSkillFromDisk(id, dir))
  }

  validateSkillRegistry(entries, dir)

  if (dir === skillsContentDir()) cachedRegistry = entries
  return entries
}

export function getSkillById(
  id: string,
  dir = skillsContentDir(),
): AvaSkillEntry | undefined {
  return loadSkillRegistry(dir).find((s) => s.id === id)
}

export function getDecisionRulesBody(dir = skillsContentDir()): string {
  const brain = getSkillById(MARKETING_BRAIN_ID, dir)
  const ref = brain?.references.find((r) => r.name === DECISION_RULES_REF)
  if (!ref) {
    throw new Error(
      `Marketing brain missing ${DECISION_RULES_REF} — cannot chain decision rules`,
    )
  }
  return ref.body
}

/** Injection size: body + learnings + chained decision-rules + largest single reference. */
export function skillInjectionChars(
  skill: AvaSkillEntry,
  decisionRulesChars: number,
): number {
  const largestRef = skill.references.reduce(
    (max, r) => Math.max(max, r.body.length),
    0,
  )
  const chainChars =
    skill.chains?.includes(MARKETING_BRAIN_ID) ? decisionRulesChars : 0
  return skill.body.length + skill.learnings.length + chainChars + largestRef
}

export function validateSkillRegistry(
  entries: AvaSkillEntry[],
  dir = skillsContentDir(),
): void {
  if (entries.length !== EXPECTED_SKILL_IDS.length) {
    throw new Error(
      `Expected ${EXPECTED_SKILL_IDS.length} skills, got ${entries.length}`,
    )
  }

  const ids = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate skill id: ${entry.id}`)
    ids.add(entry.id)

    if (!entry.body.trim()) throw new Error(`${entry.id}: empty body`)
    if (!entry.triggerSummary.trim()) {
      throw new Error(`${entry.id}: empty triggerSummary`)
    }
    const wordCount = entry.triggerSummary.split(/\s+/).filter(Boolean).length
    if (wordCount > 60) {
      throw new Error(
        `${entry.id}: triggerSummary has ${wordCount} words (max 60)`,
      )
    }

    for (const chainId of entry.chains ?? []) {
      if (!ids.has(chainId) && !EXPECTED_SKILL_IDS.includes(chainId)) {
        throw new Error(`${entry.id}: chains to unknown skill ${chainId}`)
      }
      if (chainId === entry.id) {
        throw new Error(`${entry.id}: cannot chain to itself`)
      }
    }
  }

  for (const expected of EXPECTED_SKILL_IDS) {
    if (!ids.has(expected)) throw new Error(`Missing skill: ${expected}`)
  }

  // Chained skills must exist in the loaded set
  for (const entry of entries) {
    for (const chainId of entry.chains ?? []) {
      if (!ids.has(chainId)) {
        throw new Error(`${entry.id}: chained skill ${chainId} not loaded`)
      }
    }
  }

  const version = loadSkillsVersion(dir)
  for (const entry of entries) {
    const v = version.skills[entry.id]
    if (!v) throw new Error(`VERSION.json missing skill ${entry.id}`)
    if (v !== entry.version) {
      throw new Error(
        `VERSION.json ${entry.id}=${v} but SKILL.md version=${entry.version}`,
      )
    }
  }

  const brain = entries.find((e) => e.id === MARKETING_BRAIN_ID)
  const decisionRules =
    brain?.references.find((r) => r.name === DECISION_RULES_REF)?.body ?? ""
  if (!decisionRules) {
    throw new Error(
      `Marketing brain missing ${DECISION_RULES_REF} — cannot validate chain budget`,
    )
  }

  const oversized: string[] = []
  for (const entry of entries) {
    const size = skillInjectionChars(entry, decisionRules.length)
    if (size > SKILL_INJECTION_BUDGET_CHARS) {
      oversized.push(`${entry.id}: ${size} > ${SKILL_INJECTION_BUDGET_CHARS}`)
    }
  }
  if (oversized.length) {
    throw new Error(
      `Skill injection budget exceeded (body + learnings + chained decision-rules + largest ref ≤ ${SKILL_INJECTION_BUDGET_CHARS}):\n${oversized.join("\n")}`,
    )
  }
}

/** Reset cache — tests only. */
export function __resetSkillRegistryCacheForTests(): void {
  cachedRegistry = null
}
