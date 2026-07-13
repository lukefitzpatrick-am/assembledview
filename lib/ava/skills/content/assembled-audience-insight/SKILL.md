---
name: assembled-audience-insight
description: Find audience insights and planning themes from Roy Morgan Single Source data and Assembled View planning tool outputs. Use this skill whenever analysing a Roy Morgan crosstab export, Helix Personas, audience profiles, media consumption data, or planning tool audience data - or when asked "what's interesting about this audience", "find the insight in this data", "who is this audience", "build the audience story", "what's the theme for the plan", or "how should we reach [audience]". Input is typically an xlsx/csv export or data on the Assembled View screen. Output is unique, non-obvious audience insights grounded in the Assembled marketing brain, with channel and creative implications.
metadata:
  version: 1.1.0
---

# Audience insight from Roy Morgan and the planning tool

The job: find what is unique, non-obvious or genuinely interesting about an audience in the data, then turn it into planning and creative direction. Not a demographic readback.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` in this skill folder - client calibrations and known data quirks override defaults.
2. Load the **assembled-marketing-brain** skill. Audience insights must survive its tests: no persona-sliver targeting for growth briefs, category buyers first, reach and mental availability framing.
3. Identify the data source and read `references/roy-morgan-guide.md` for the export format, metric definitions and parsing code before touching a Roy Morgan file.
4. **Unknown formats (planning tool outputs, Helix Personas, new export shapes): inspect first, then ask.** Open the file, describe what you see (sheets, headers, metrics), state your reading of what each metric means, and confirm with Luke before interpreting. Never guess metric definitions. Once confirmed, flag the format for documenting in the skill.


## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- the audience definition and the exact filter/base used in the export
- the brief behind the question (planning a campaign, pitching, creative springboard) - it changes which findings matter
- which data this is (Roy Morgan crosstab, planning tool output, other) and that you can parse it correctly

If any of these is unknown, the data does not mean what you expected, or two reasonable interpretations would produce different deliverables, stop. Ask short, numbered questions, or present 2-3 options with a recommendation, and wait for direction. Do not produce a draft on a guess. This beats a polished wrong answer every time. When delivering judgement calls, state your confidence and flag anything below ~90%.
## Analysis workflow

1. **Parse properly.** Roy Morgan crosstab exports carry a metadata block (source month, filter, weights, layer), demographic banner columns, then rows of variables with paired metrics: `wc` (weighted count, '000s), `v%` (vertical % - penetration of that column's demographic), and on layered sheets `z%` (horizontal % - the layer's share of the national row). Use the parsing approach in the reference file.
2. **Compute indexes.** The export does not include them. Index = (segment v% / ALL PEOPLE 14+ v%) x 100. Compute for every variable x segment. 110+ is over-indexing; 80- is under-indexing. Both directions matter.
3. **Check the base before believing anything.** Flag any cell where the unweighted n is under ~50 as indicative only, and refuse to headline it. State the source month and sample (e.g. "Roy Morgan Single Source, April 2026, n=59,706").
4. **Hunt in the right places.** The interesting findings usually live in:
   - **Gaps between index and size.** A channel that over-indexes at 130 but reaches 12% of the audience is a flavour, not a plan. A channel at index 105 reaching 85% is the plan. Report both index and absolute reach, always.
   - **Contradictions of the brief's assumptions.** The client thinks their buyer is 25-34 and digital-only; the data says half the volume is 50+ and watching linear TV.
   - **Within-audience splits.** Where a behaviour flips between the audience's sub-groups (e.g. podcasts double between men 14-24 and 25-34).
   - **State and layer differences.** Use z% sheets to find where the audience actually lives vs where the budget goes.
   - **Time comparisons.** If a prior period export exists, movement beats level.
5. **Convert to insight.** Climb the ladder from the insight-commentary skill: observation, insight, implication, action. Each headline finding must change a planning or creative decision, or it is cut.
6. **Apply the brain.**
   - Never turn an over-index into a recommendation to exclude everyone else. Growth audiences stay broad; indexes guide weighting, context and creative, not exclusion.
   - Translate media consumption into a reach architecture: which 2-3 channels combine to unduplicated coverage of the audience each week.
   - Translate life-stage and attitude data into Category Entry Points and creative hooks: when and why does this audience enter the category?
   - Respect attention: a high-reach channel with low attention elasticity needs frequency or high-impact formats to encode.

## Output format

```
AUDIENCE: [definition, source, month, unweighted n]

THE HEADLINE
One sentence: the most useful non-obvious truth about this audience.

WHAT STANDS OUT (3-5 findings, each: observation -> insight -> implication)
- Finding, with v%, index and absolute size. Why it is not what you would assume. What it changes.

REACH ARCHITECTURE
The 2-3 channel combination that covers the audience weekly, with v% reach
per channel and the role of each (reach base / attention layer / activation).

CREATIVE AND CEP DIRECTION
Buying situations this audience enters the category from, and the hooks
the data supports.

WATCH-OUTS
Small bases, data limits, what we could not see in this export.
```

Voice: Assembled standard. Short sentences, Australian English, no em dashes, numbers tied to outcomes. Lead with the metric.

See `references/example-output.md` for a worked example from a real export structure.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: a doc named "AVA Learnings" in the Assembled View project knowledge (or a connected folder). Search for it before starting; entries tagged `assembled-audience-insight` or the current client override this skill's defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder - the snapshot folded in when the skill was last reissued.

This skill folder is read-only once installed, so never try to append to it at runtime. When a new learning arises (Luke corrects or edits an output, a client rule emerges, a spec changes in-platform):

- End the response with a formatted entry and ask Luke to add it to the AVA Learnings doc:
  `[LEARNING | assembled-audience-insight | client | YYYY-MM-DD]` what changed, and the rule going forward.
- When the doc holds ~10+ entries for this skill, suggest reissuing the skill with them folded into `LEARNINGS.md`.
- Log client audience definitions (exact Roy Morgan filters) so re-runs are consistent, and flag new export formats for documenting in the skill.
