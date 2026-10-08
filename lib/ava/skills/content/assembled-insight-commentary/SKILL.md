---
name: assembled-insight-commentary
description: Write insights and delivery commentary the Assembled Media way. Use this skill whenever writing campaign delivery commentary, weekly or monthly performance commentary, pacing commentary, post-campaign analysis (PCA), quarterly reviews, report narratives, or standalone insights from campaign or market data - including commentary generated inside Assembled View / AVA from what is on the page. Trigger on "write commentary", "add commentary", "explain these results", "what happened this month", "write the insight", "PCA", "performance narrative", or any request to interpret campaign delivery or performance data for a client. Covers not just what happened, but how and why, compared to what has occurred before and what the future holds.
metadata:
  version: 1.2.0
---

# Insight and delivery commentary

Commentary is not a restatement of the chart. Every finding is an Insight, an Action and an Outcome. Before writing, use four questions as a thinking checklist: what happened, how it happened, why it happened, and what we do next. It compares to what has occurred (targets, prior periods, benchmarks) and says what the future holds.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` in this skill folder. Client calibrations and past corrections override the defaults below.
2. Load the **assembled-marketing-brain** skill (if unavailable, say strategic grounding is missing and apply its ten commitments from memory with care). Every explanation must be consistent with it: activation harvests mental availability and decays fast; brand builds it and compounds; reach, continuity and attention explain delivery mechanics.
3. Call **get_campaign_insights** (MBA on the page) and/or **get_client_insights** before drafting. Live rows only. Prior insights are context. Do not restate them as current analysis. When you build on one, say in words what was believed before and what has changed.
4. Identify the data. The primary data is **what is on the page** (the Assembled View screen, a pasted table, an uploaded report). Do not invent numbers. If a needed figure is not on the page, name it as missing rather than estimating it. Delivery $ / KPIs come from **get_delivery_snapshot**, never from insight bodies.
5. Gather context in three rings (see `references/context-sources.md` for sources and how to search them):
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

## Insight, Action, Outcome

Every finding is written in three parts, in this order, and labelled with these exact words.

**Insight.** What happened and why it matters, in one or two sentences. Lead with the so-what, then the evidence: the number and at least one anchor (target, prior period or benchmark). State a cause only when the data shows it. Otherwise say what would confirm it.

**Action.** The specific next step, with an owner (Assembled, the client, or the publisher by name) and a time frame. One action per insight. If nothing should change, the action is "Hold" with the reason.

**Outcome.** The effect, as a number. For work already done, the achieved result ("CPA down 18% to $42 since the shift on 3 Oct"). For a recommendation, the expected effect and its basis ("about 1,200 more clicks a week at the current $1.85 CPC"). Never invent a figure. If it can't be estimated from the data provided, say what will be measured and when.

Tests before you finish: an observation with no so-what is not an Insight; an action with no owner is not an Action; an outcome with no number and no measurement plan is not an Outcome.

In decks and in AssembledView these parts carry the Insight (sky), Action (forest) and Outcome (lime) tags. Write plain text; the template applies the tags.

## Commentary structure

Lead with the answer, then the findings.

**Summary.** One sentence: the most important Insight and its Outcome.

Then 2 to 4 items. Each item is Insight, then Action, then Outcome, in that order, labelled with those words.

The four questions stay a thinking checklist, not output headings. What and how are the Insight's evidence (the number and at least one of target, prior period or benchmark; decompose the move, such as CPA from CPM or CVR, and CPM from auction, frequency, creative or mix). Why is its cause (internal decision log, or external seasonality, competitors, platform changes, macro). State a cause only when the data shows it. Otherwise say what would confirm it. What next becomes the Action and Outcome.

For PCAs: restate objectives and KPIs first so results read against intent, then delivery vs plan (spend, reach, frequency, channel mix), performance vs benchmarks, what worked and what did not (state misses honestly with a recovery plan), learnings, and recommendations that frame the next campaign and budget.

## Framing results through the brain

- Say which effect the money bought. Activation results judged in-window on CPA/ROAS. Brand results judged on the long clock: branded search, share of search, reach and attention delivered - never short-window CPA.
- Explain strong activation partly as harvesting the mental availability that brand work built. Explain weakening activation efficiency after brand goes dark as decay.
- Use attention and reach mechanics to explain delivery: placement mix shifting toward low-attention inventory can hold CPMs flat while eroding effect.

## Failure modes - self-check before delivering

Reject the draft if any block: merely restates numbers; asserts a cause without ruling out seasonality, promos or competitors; uses untranslated platform jargon; dumps metrics; ends without an Action (a Hold counts) or an Outcome; hides a miss; or lacks all three comparison anchors. Round numbers sensibly. One idea per paragraph.

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
