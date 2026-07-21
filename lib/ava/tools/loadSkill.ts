import type AvaTool from "./types"
import {
  DECISION_RULES_REF,
  MARKETING_BRAIN_ID,
  isKnownSkillId,
  loadSkillRegistrySafe,
  tryGetDecisionRulesBody,
} from "@/lib/ava/skills/registry"
import { asRecord, asString } from "./helpers"

export function buildLoadSkillPayload(skillId: string, reference?: string) {
  const { skills, skipped } = loadSkillRegistrySafe()
  const skill = skills.find((s) => s.id === skillId)

  if (!skill) {
    if (isKnownSkillId(skillId) || skipped.some((s) => s.id === skillId)) {
      return {
        error:
          "That skill is temporarily unavailable — I've flagged it",
      }
    }
    const known = skills.map((s) => s.id)
    return {
      error: `Unknown skillId "${skillId}". Known: ${known.join(", ")}`,
    }
  }

  const parts: string[] = [
    `# Skill: ${skill.title} (${skill.id} v${skill.version})`,
    "",
    skill.body.trim(),
  ]

  if (skill.learnings.trim()) {
    parts.push("", "# Learnings", "", skill.learnings.trim())
  }

  let chainedDecisionRules = false
  if (skill.chains?.includes(MARKETING_BRAIN_ID)) {
    const rules = tryGetDecisionRulesBody()
    if (rules) {
      chainedDecisionRules = true
      parts.push(
        "",
        `# Chained: ${MARKETING_BRAIN_ID} / ${DECISION_RULES_REF}`,
        "",
        rules.trim(),
      )
    }
  }

  let loadedReference: string | null = null
  if (reference) {
    const refName = reference.endsWith(".md") ? reference : `${reference}.md`
    const ref = skill.references.find(
      (r) => r.name === refName || r.name === reference,
    )
    if (!ref) {
      return {
        error: `Reference "${reference}" not found on ${skill.id}. Available: ${
          skill.references.map((r) => r.name).join(", ") || "(none)"
        }`,
      }
    }
    loadedReference = ref.name
    parts.push("", `# Reference: ${ref.name}`, "", ref.body.trim())
  }

  return {
    skillId: skill.id,
    title: skill.title,
    version: skill.version,
    pairedTools: skill.pairedTools,
    availableReferences: skill.references.map((r) => r.name),
    loadedReference,
    chainedDecisionRules,
    content: parts.join("\n"),
  }
}

export const loadSkillTool: AvaTool = {
  definition: {
    name: "load_skill",
    description:
      "Load one Assembled skill module (body + learnings). Optionally load a single named reference (e.g. specs-and-evidence, example-output). Auto-appends marketing-brain decision rules when the skill chains to them. Load at most ONE skill per turn; call again with reference only when the skill body tells you to.",
    input_schema: {
      type: "object",
      properties: {
        skillId: {
          type: "string",
          description:
            "Skill id, e.g. assembled-insight-commentary, assembled-meta-copy, assembled-presentations.",
        },
        reference: {
          type: "string",
          description:
            "Optional single reference filename or stem (e.g. specs-and-evidence or example-output.md). Never load all references upfront.",
        },
      },
      required: ["skillId"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (!context.roles.includes("admin")) {
      return {
        content: "load_skill is available to Admin users only.",
        isError: true,
      }
    }

    const args = asRecord(input)
    const skillId = asString(args.skillId)
    if (!skillId) {
      return { content: "skillId is required.", isError: true }
    }
    const reference = asString(args.reference)

    try {
      const payload = buildLoadSkillPayload(skillId, reference)
      if ("error" in payload && payload.error) {
        return { content: payload.error, isError: true }
      }
      // Return markdown content as the tool result (not JSON) so the model can follow it directly.
      const meta = [
        `skillId: ${payload.skillId}`,
        `version: ${payload.version}`,
        `pairedTools: ${(payload.pairedTools ?? []).join(", ") || "(none)"}`,
        `availableReferences: ${(payload.availableReferences ?? []).join(", ") || "(none)"}`,
        `loadedReference: ${payload.loadedReference ?? "(none)"}`,
        `chainedDecisionRules: ${payload.chainedDecisionRules ? "yes" : "no"}`,
        "",
        "---",
        "",
        payload.content,
      ].join("\n")
      return { content: meta, isError: false }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load skill: ${message}`, isError: true }
    }
  },
}
