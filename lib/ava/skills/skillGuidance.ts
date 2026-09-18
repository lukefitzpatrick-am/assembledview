/**
 * Routing guidance for Assembled skill modules via load_skill.
 * Trigger summaries are compressed from SKILL.md frontmatter at load time.
 */

import { loadSkillRegistrySafe } from "@/lib/ava/skills/registry"

export const AVA_SKILL_TOOL_HINTS = `
- load_skill — load ONE Assembled skill (body + learnings; optional single reference). Auto-chains marketing-brain decision rules when the skill declares it. Prefer this before drafting commentary, copy, audience insights, video scripts, or presentation outlines.
`.trim()

function buildSkillGuidanceTable(): string {
  const rows = loadSkillRegistrySafe().skills.map((skill) => {
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
Load at most ONE skill per turn (plus its auto-chained decision rules). Page skill buttons send a visible user message — route via load_skill from that intent; there is no hidden side-channel. Skills' "clarify below ~90% confidence — ask" rule is binding; ask ONE clarifying question per turn (same as engagement rules). Load references lazily: call load_skill again with reference when the skill body says to (e.g. specs-and-evidence, example-output) — never all upfront. Respect get_platform_specs character limits when a copy skill says write to spec. For commentary: four questions (what/how/why/next); never invent numbers; name omitted context rings (minimal mode). Before plan rationale, delivery commentary, or a performance report: call get_client_insights and/or get_campaign_insights (live rows only). Prior insights are context — never restate them as current findings without saying what was believed before and what has changed. Delivery $ / KPIs come only from get_delivery_snapshot (never from insight bodies).
Commentary: load assembled-insight-commentary THEN get_campaign_insights (or get_client_insights) + get_delivery_snapshot (campaign delivery) / get_pacing_snapshot (client-level) / get_campaign_context.
Copy (meta/search/linkedin/video): load the matching copy skill THEN get_client_brain first (Tone / never-say), then get_client_details + get_saved_audiences + get_best_practice + get_platform_specs.
Audience insight: load assembled-audience-insight THEN get_saved_audiences + get_methodology + use planning page context.
Presentations: load assembled-presentations (outline-only in Ava) THEN get_campaign_context / get_pacing_snapshot as needed — do not generate .pptx (the ONE exception is generate_performance_report inside assembled-performance-review-report).
Media-plan auto-populate (xlsx radio/OOH into the create/edit form): load assembled-media-plan-autopopulate. Summarise the pending parse; wait for explicit confirm; then apply_parsed_plan. Never invent spend figures. To align descriptor fields on already-loaded lines, use adjust_line_items (ops + confirm; never money).
Publisher schedule ingest (xlsx via AVA attach): call get_pending_ingest_review; echo the parity report (do not rewrite numbers; never mention tool names or stage ids to the user; if a review is gone, echo the tool — do not invent a cause); ask only via the question cards — never as prose asking the user to type a column name. If MBA is not in page context the MBA card is the normal path — never guess. After a card confirm, pass answers and restate only what changed and what is still open; do not restate the parity report. Wait for confirm then load_ingest_into_form (create/edit) or accept_ingest_proposal (Hub). Same Hub engine and 409 money / discrepancy gates. Offer the full_review_path for the Parse Review page (same staged upload; per-row confirm/exclude gates load). Unknown publisher → confirm the proposed profile cards field by field after the human picks the catalogue publisher on Hub; do not guess; do not load until confirmed.
Planning rationale: call get_client_insights (and get_campaign_insights when an MBA is in scope) before drafting; attribute priors; never invent money.
Performance review & report (campaign dashboard pages / Review & Report button): load assembled-performance-review-report THEN get_campaign_insights + get_delivery_snapshot (campaign delivery) / get_pacing_snapshot (client-level) / get_campaign_context. generate_performance_report ONLY after the user explicitly confirms the reviewed narrative — never unprompted. Pass narrative only; hard $ / KPI figures are injected server-side from reconciled delivery — never invent free-text dollar amounts in narrative fields; never copy a prior insight near-verbatim without attribution (tool rejects with unattributed_prior_insight, same shape as invented_money_figure). The review narrative is exempt from the 150-word default: aim ≤500 words, sections in the skill's order, still no markdown headers.
Campaign read (dashboard Regenerate / "write the read"): load assembled-campaign-read THEN get_campaign_context + get_delivery_snapshot + get_campaign_insights. Use the campaign KPI review rows supplied with the generate job. Pace vs expected comes from delivery snapshot reportedTotals. Never call get_pacing_snapshot. What was planned uses liveLineBudgetTotal (sum of live line budgets), not the MBA booked total. delivery_state no_source / no_rows_yet is not zero delivery and not the worst thing when a reported line is behind. Never promise follow-up or name a person/partner as being contacted. Return JSON six beats only. Never invent a cause. Empty beat = "Nothing to report yet."
Scenario planner (pacing / campaign "what if", daily need, back on track): load assembled-scenario-planner THEN run_scenario (MBA from the page). Pair get_campaign_context + get_delivery_snapshot. Never invent a rate; if a line has no delivered rate, say the plan rate was used. Answer with the tool narrative plus the change list.
Client marketing brain: load client-marketing-brain THEN get_client_brain; research with web_search; interview one question at a time; save_client_brain after confirm (never overwrite non-empty links without asking).
${rows.join("\n")}
`.trim()
}

/** Built at module init from the skill registry (fs read once). */
export const AVA_SKILL_GUIDANCE = buildSkillGuidanceTable()
