/**
 * Routing guidance for Assembled skill modules via load_skill.
 * Trigger summaries are compressed from SKILL.md frontmatter at load time.
 */

import { loadSkillRegistry } from "@/lib/ava/skills/registry"

export const AVA_SKILL_TOOL_HINTS = `
- load_skill — load ONE Assembled skill (body + learnings; optional single reference). Auto-chains marketing-brain decision rules when the skill declares it. Prefer this before drafting commentary, copy, audience insights, video scripts, or presentation outlines.
`.trim()

function buildSkillGuidanceTable(): string {
  const rows = loadSkillRegistry().map((skill) => {
    const when =
      skill.id === "assembled-marketing-brain"
        ? "Never load alone as a button target — it auto-chains via other skills' decision rules. Load only when the user asks for the marketing brain / Assembled POV explicitly."
        : `When: ${skill.triggerSummary}`
    const tools =
      skill.pairedTools.length > 0
        ? `Paired tools (after load): ${skill.pairedTools.join(", ")}`
        : "Paired tools: (none — grounding only)"
    return `- ${skill.id} — ${when} ${tools}`
  })

  return `
Assembled skills (load_skill):
Load at most ONE skill per turn (plus its auto-chained decision rules). Page skill buttons send a visible user message — route via load_skill from that intent; there is no hidden side-channel. Skills' "clarify below ~90% confidence — ask" rule is binding; ask ONE clarifying question per turn (same as engagement rules). Load references lazily: call load_skill again with reference when the skill body says to (e.g. specs-and-evidence, example-output) — never all upfront. Respect get_platform_specs character limits when a copy skill says write to spec. For commentary: four questions (what/how/why/next); never invent numbers; name omitted context rings (minimal mode).
Commentary: load assembled-insight-commentary THEN get_pacing_snapshot / get_campaign_context.
Copy (meta/search/linkedin/video): load the matching copy skill THEN get_client_details + get_saved_audiences + get_best_practice + get_platform_specs.
Audience insight: load assembled-audience-insight THEN get_saved_audiences + get_methodology + use planning page context.
Presentations: load assembled-presentations (outline-only in Ava) THEN get_campaign_context / get_pacing_snapshot as needed — do not generate .pptx (the ONE exception is generate_performance_report inside assembled-performance-review-report).
Performance review & report (campaign dashboard pages / Review & Report button): load assembled-performance-review-report THEN get_pacing_snapshot + get_campaign_context. generate_performance_report ONLY after the user explicitly confirms the reviewed narrative — never unprompted.
${rows.join("\n")}
`.trim()
}

/** Built at module init from the skill registry (fs read once). */
export const AVA_SKILL_GUIDANCE = buildSkillGuidanceTable()
