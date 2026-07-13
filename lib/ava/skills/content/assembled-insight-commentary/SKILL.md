---
name: assembled-insight-commentary
description: Write insights and delivery commentary the Assembled Media way. Use this skill whenever writing campaign delivery commentary, weekly or monthly performance commentary, pacing commentary, post-campaign analysis (PCA), quarterly reviews, report narratives, or standalone insights from campaign or market data - including commentary generated inside Assembled View / AVA from what is on the page. Trigger on "write commentary", "add commentary", "explain these results", "what happened this month", "write the insight", "PCA", "performance narrative", or any request to interpret campaign delivery or performance data for a client. Covers not just what happened, but how and why, compared to what has occurred before and what the future holds.
metadata:
  version: 1.1.0
---

# Insight and delivery commentary

Commentary is not a restatement of the chart. It answers four questions in order: what happened, how it happened, why it happened, and what we do next. It compares to what has occurred (targets, prior periods, benchmarks) and says what the future holds.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` in this skill folder. Client calibrations and past corrections override the defaults below.
2. Load the **assembled-marketing-brain** skill (if unavailable, say strategic grounding is missing and apply its ten commitments from memory with care). Every explanation must be consistent with it: activation harvests mental availability and decays fast; brand builds it and compounds; reach, continuity and attention explain delivery mechanics.
3. Identify the data. The primary data is **what is on the page** (the Assembled View screen, a pasted table, an uploaded report). Do not invent numbers. If a needed figure is not on the page, name it as missing rather than estimating it.
4. Gather context in three rings (see `references/context-sources.md` for sources and how to search them):
   - **Client ring**: search available client knowledge (project files, prior reports, meeting notes, client folder) for objectives, targets, seasonality, promotions, known events in the period.
   - **Market ring**: category and competitive activity in the campaign period - competitor launches, competitive spend shifts, platform changes (Google core updates, Meta delivery changes), category seasonality, cultural moments (EOFY, Black Friday, footy finals, elections).
   - **Macro ring**: Australian macro indicators relevant to the category - Westpac-Melbourne Institute consumer sentiment, NAB business confidence, ABS retail trade and household spending, RBA cash rate moves. Web-search the latest values for the period (search "[indicator] [month year]" and "[category] Australia [month year]"); never quote stale figures from memory.

**Minimal mode**: if web search or client knowledge is unavailable in the current environment, write from on-page data and marketing brain reasoning only, and say explicitly which context rings were omitted and why. Never fill the gap from memory.


## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- the reporting period and the comparison periods available
- the client objective and the one or two metrics that matter most to them
- who reads this (client CMO, board, internal) and the expected length/format
- what we changed mid-flight (the decision log) - ask the account team if not on the page

If any of these is unknown, the data does not mean what you expected, or two reasonable interpretations would produce different deliverables, stop. Ask short, numbered questions, or present 2-3 options with a recommendation, and wait for direction. Do not produce a draft on a guess. This beats a polished wrong answer every time. When delivering judgement calls, state your confidence and flag anything below ~90%.
## The insight ladder (non-negotiable)

Every insight must climb all four rungs:

1. **Observation** - what the data shows, stated neutrally.
2. **Insight** - the non-obvious pattern or cause behind it, tied to buyer behaviour (marketing brain language: light buyers, mental availability, CEPs, attention, auction mechanics).
3. **Implication** - what it means for this client's objective.
4. **Action** - the specific next step, with an owner and expected effect.

Quality test on every insight: true (grounded in the data on the page), non-obvious, actionable, human, simple. Then the "so what" test: if the client's next decision would not change, it is an observation, not an insight - cut it or climb further.

## Commentary structure

Lead with the answer (BLUF), then support it:

```
[Executive summary - 2-3 sentences]
Result vs target. The main driver. What we are doing about it.

WHAT
Performance vs three anchors: target, prior period, benchmark/norm.
3-5 metrics that map to the client objective. Not a metric dump.

HOW (mechanics)
Decompose the movement. CPA moved because CPM moved or CVR moved.
CPM moved because of auction competition, frequency/saturation, creative
fatigue (CTR decay), or delivery mix. Reach vs planned. Pacing vs booked.

WHY (causes)
Internal: creative rotation, budget shifts, our decisions (include the
decision log - what we changed mid-flight and why).
External: seasonality, competitor activity, platform changes, macro demand.
Rule out alternatives before attributing. If the cause is unknown, say
"cause under investigation" - never fabricate causality.

WHAT NEXT
Specific actions with owners and expected effects. Or an explicit
"no action needed because...". Tie forward view to known future factors:
upcoming seasonality, auction inflation (e.g. Q4 CPMs), planned creative,
booked media changes.
```

For PCAs: restate objectives and KPIs first so results read against intent, then delivery vs plan (spend, reach, frequency, channel mix), performance vs benchmarks, what worked and what did not (state misses honestly with a recovery plan), learnings, and recommendations that frame the next campaign and budget.

## Framing results through the brain

- Say which effect the money bought. Activation results judged in-window on CPA/ROAS. Brand results judged on the long clock: branded search, share of search, reach and attention delivered - never short-window CPA.
- Explain strong activation partly as harvesting the mental availability that brand work built. Explain weakening activation efficiency after brand goes dark as decay.
- Use attention and reach mechanics to explain delivery: placement mix shifting toward low-attention inventory can hold CPMs flat while eroding effect.

## Failure modes - self-check before delivering

Reject the draft if any block: merely restates numbers; asserts a cause without ruling out seasonality/promos/competitors; uses untranslated platform jargon; dumps metrics; ends without an action or explicit no-action; hides a miss; or lacks all three comparison anchors. Round numbers sensibly. One idea per paragraph.

## Voice

Assembled voice: short, plain, direct sentences. Australian English. No em dashes. Numbers tied to outcomes ("CPM up 18%, so the same budget bought 15% fewer impressions"). Sentence case headings. No filler openers or closers. Confidence flagged when below ~90% ("we are not yet certain; two weeks more data will confirm").

## Worked example

See `references/example-output.md` for a full monthly commentary example in the correct structure and voice.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: a doc named "AVA Learnings" in the Assembled View project knowledge (or a connected folder). Search for it before starting; entries tagged `assembled-insight-commentary` or the current client override this skill's defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder - the snapshot folded in when the skill was last reissued.

This skill folder is read-only once installed, so never try to append to it at runtime. When a new learning arises (Luke corrects or edits an output, a client rule emerges, a spec changes in-platform):

- End the response with a formatted entry and ask Luke to add it to the AVA Learnings doc:
  `[LEARNING | assembled-insight-commentary | client | YYYY-MM-DD]` what changed, and the rule going forward.
- When the doc holds ~10+ entries for this skill, suggest reissuing the skill with them folded into `LEARNINGS.md`.
- Also log recurring client context (seasonality, benchmarks, phrases the client likes or hates) so future commentary starts calibrated.
