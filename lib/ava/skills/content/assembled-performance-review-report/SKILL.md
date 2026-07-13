---
name: assembled-performance-review-report
description: Review campaign delivery on an Assembled View client dashboard page, write commentary and insights, make recommendations, and on confirmation build a client-facing PowerPoint report on the Assembled template. Use whenever AVA or Luke asks to "review performance", "review delivery", "provide insight", "write the monthly report", "build the report", or when the Review & Report button is pressed on a client dashboard page. One run covers the campaign (MBA) on the page. Composes assembled-insight-commentary (the narrative) and assembled-presentations (the deck).
metadata:
  version: 1.0.0
  surface: Assembled View / AVA client dashboard pages, and Cowork
---

# Client performance review and report

One flow, four stages, one gate. Review the delivery on the page, write the commentary, land the insights and recommendations in chat for Luke (or the account lead) to sanity-check, and only then build the client-facing deck. The deck is never the first artefact. The narrative is.

Scope of one run: the single campaign (MBA) on the current page. Whole-client roll-ups are out of scope for this version - if asked for one, say so and offer to run per campaign.

## Stage 0: page context - never dead-end

The page context is the primary input. Resolve it in this order and only stop if all three fail:

1. **Injected page context**: client slug, MBA number, campaign name, flight dates supplied by the app with the request.
2. **The URL**: client dashboard pages follow `/dashboard/{clientSlug}/{mbaNumber}` (e.g. `/dashboard/bic/BICAU001`). Parse the slug and MBA from it.
3. **On-page content**: the MBA chip and page furniture (e.g. "MBA BICAU001") visible in the extracted page content.

Only if none of these yields a client and MBA: ask one short question naming exactly what is missing. Never reply "I don't have one in the current page context" when the URL on screen contains the MBA - that is a context plumbing failure, not a user problem. Never proceed on a guessed MBA.

Also establish before Stage 1:

- the reporting period in view (flight to date, calendar month, custom range) and the comparison periods available
- the client objective and the one or two metrics that matter most (from client knowledge, the media plan, or AVA Learnings; if genuinely unknown, ask)
- the decision log: what we changed mid-flight (ask the account team if not on the page; if unavailable, say so in the commentary rather than omitting it)

## Stage 1: delivery review

Pull the campaign's delivery data (pacing snapshot, planned vs delivered, per-channel lines). Read every performance container on the page. Do not invent or re-derive numbers; if a needed figure is not available, name it as missing.

For each of the following, record planned, delivered, variance, and an on/off pace call against *expected to date* (not end-of-flight totals):

- **Spend delivery**: delivered vs planned spend, pacing % vs 100% expected delivery, days elapsed vs flight length.
- **Deliverable delivery**: impressions/views/clicks delivered vs planned, by channel line (e.g. Meta, BVOD lines, programmatic video, TikTok, influencers).
- **Delivery KPIs**: CPM, CTR, CPC, CVR, CPA (and channel-appropriate equivalents like CPCV, VTR) vs target, prior period, and benchmark where available.
- **Flags**: anything off pace beyond ±5%, overdelivery, KPIs at implausible values (a 0.00% CVR is a tracking question before it is a performance question), channel lines not yet live vs plan, lines ending soon with delivery outstanding.

Output of this stage (internal): a short structured review table - channel line, planned, delivered, pace, KPI reads, flags. This is the evidence base every later number must trace back to.

## Stage 2: commentary

Apply **assembled-insight-commentary** in full (and **assembled-marketing-brain** for every explanation). Non-negotiables restated:

- Structure: BLUF executive summary, then WHAT / HOW / WHY / WHAT NEXT.
- Three anchors on every performance claim: target, prior period, benchmark or norm. Name any anchor that is unavailable.
- Decompose mechanics before assigning causes (CPA moved because CPM or CVR moved; CPM moved because of auction, frequency, fatigue, or mix).
- Causes: rule out seasonality, promotions, and competitor activity before attributing to our work. "Cause under investigation" beats fabricated causality.
- Search the AVA Learnings doc for this client's calibrations before writing. Client entries override defaults.
- No jokes anywhere in this flow. This is delivery and money.

## Stage 3: insights and recommendations

Every insight climbs the full ladder: observation, insight, implication, action. Apply the so-what test; anything that would not change the client's next decision is an observation - cut it or climb further.

Split recommendations into two lists:

1. **In-flight optimisations**: changes to make now, each with an owner and expected effect (e.g. "shift $X from line A to line B to recover pace by [date]").
2. **Next-period recommendations**: planning moves for the next month/quarter/campaign, grounded in the marketing brain (reach, continuity, attention, brand/activation balance).

Aim for 2-4 insights and 2-5 recommendations. Fewer, sharper items beat a list that pads.

## The gate: review in chat, then build

Post the full narrative in the chat panel in this order: executive summary, delivery review summary, commentary, insights, recommendations. Then stop and ask one question: build the report, or change anything first?

- Edits requested: apply them, restate only what changed, ask again.
- Only on an explicit yes: build the deck. Never generate the file unprompted, and never silently include narrative the user has not seen.

## Stage 4: the report

Client-facing monthly/WIP report on the fixed 10-slide Assembled report template (derived from the master brand template - never build from scratch, never restyle).

**In Ava (Assembled View)**: call the `generate_performance_report` tool with the confirmed narrative mapped to its fields. The tool fills the template and returns a download card in the chat panel (same pattern as the MI workbook export). Call it ONLY after the explicit yes at the gate.

**In Cowork/Claude**: build the same structure with the **assembled-presentations** skill from the master template.

The fixed report structure (every field filled - if a campaign has fewer than 4 channel lines or KPIs, combine lines or close the set with a flight-dates/pacing line, never leave a box empty):

| Slide | Content | Fields |
|---|---|---|
| 1 Cover | logo cover, no text | - |
| 2 Executive summary | the BLUF, one bold statement | execSummary |
| 3 Delivery vs plan | spend and deliverables vs expected to date | deliverySpend, deliveryDeliverables |
| 4 Channel commentary | one point per channel group | channels x4 |
| 5 Delivery KPIs | numbers lead, lime on dark | kpis x4 |
| 6 Key insight | the one lead insight, full ladder compressed | keyInsight |
| 7 Insights | supporting insights | insights x3 |
| 8 Recommendations | in-flight vs next period | recsInFlight, recsNextPeriod |
| 9 Next steps | 4 steps, when + what | steps x4 (when, what) |
| 10 End | logo close, no text | - |

Slide copy rules: single-line strings per field (no line breaks), numbers lead, Australian English, sentence case, short lines, no em dashes, no filler. Match copy length to the box - shorten copy rather than crowd it (the tool enforces character caps; if it rejects a field, tighten the copy, never pad elsewhere). Every number on a slide must exist in the Stage 1 review or on the page - never re-derived.

File name: `{Client} {MBA} performance report {Mon YYYY}.pptx`.

## The 90% rule

Below ~90% confidence, never guess - ask. This applies at every stage: unknown objective, ambiguous period, data that does not mean what you expected, or two reasonable narratives from the same numbers. Short numbered questions or 2-3 options with a recommendation. A polished wrong report is the worst outcome this skill can produce.

## Failure modes - self-check before the gate

Reject the draft if any of: commentary merely restates the containers; a cause asserted without ruling out alternatives; a miss hidden or softened; pacing judged against end-of-flight instead of expected-to-date; a metric dump instead of the 3-5 metrics that map to the objective; recommendations without owners; numbers on slides that do not trace to Stage 1; humour anywhere.

## Learnings and improvement loop

Same loop as the parent skills. Search the AVA Learnings doc before starting; entries tagged `assembled-performance-review-report`, `assembled-insight-commentary`, `assembled-presentations`, or the current client override defaults. When Luke corrects an output, end the response with:

`[LEARNING | assembled-performance-review-report | client | YYYY-MM-DD]` what changed, and the rule going forward.
