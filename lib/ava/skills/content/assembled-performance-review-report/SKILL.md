---
name: assembled-performance-review-report
description: Review campaign delivery on an Assembled View client dashboard page, write commentary as Insight, Action and Outcome, and on confirmation supply the text for a client-facing PowerPoint report. The app applies the v5 Assembled template. Use whenever AVA or Luke asks to "review performance", "review delivery", "provide insight", "write the monthly report", "build the report", or when the Review & Report button is pressed on a client dashboard page. One run covers the campaign (MBA) on the page. Composes assembled-insight-commentary 1.2.0 (the narrative) and assembled-presentations (the deck text).
metadata:
  version: 1.2.0
  surface: Assembled View / AVA client dashboard pages, and Cowork
---

# Client performance review and report

One flow, one gate. Review the delivery on the page, write the commentary as a Summary plus Insight, Action and Outcome items, land that narrative in chat for Luke (or the account lead) to sanity-check, and only then hand the text to the app. The deck is never the first artefact. The narrative is.

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

Call **get_campaign_insights** first (live priors only) so commentary does not reinvent last cycle's findings. Then pull delivery with `get_delivery_snapshot` - it reads the same source as the on-page delivery containers (social Meta/TikTok, programmatic display and video, ad-serving/BVOD, search), returning delivered spend, impressions, clicks and views per line against the plan's budgets. Use `get_campaign_context` for plan and version detail, and `get_pacing_snapshot` only for client-level pacing questions outside a campaign page. Read every performance container on the page. Do not invent or re-derive numbers; if a needed figure is not available, name it as missing. Never take spend/KPI figures from insight bodies.

For each of the following, record planned, delivered, variance, and an on/off pace call against *expected to date* (not end-of-flight totals):

- **Spend delivery**: delivered vs planned spend, pacing % vs 100% expected delivery, days elapsed vs flight length.
- **Deliverable delivery**: impressions/views/clicks delivered vs planned, by channel line (e.g. Meta, BVOD lines, programmatic video, TikTok, influencers).
- **Delivery KPIs**: CPM, CTR, CPC, CVR, CPA (and channel-appropriate equivalents like CPCV, VTR) vs target, prior period, and benchmark where available.
- **Flags**: anything off pace beyond ±5%, overdelivery, KPIs at implausible values (a 0.00% CVR is a tracking question before it is a performance question), channel lines not yet live vs plan, lines ending soon with delivery outstanding.

Output of this stage (internal): a short structured review table - channel line, planned, delivered, pace, KPI reads, flags. This is the evidence base every later number must trace back to.

## Stage 2: commentary

Apply **assembled-insight-commentary** 1.2.0 in full (and **assembled-marketing-brain** for every explanation). This is the narrative. There is no separate insights-and-recommendations stage. Recommendations are the Actions.

**Summary.** One sentence: the most important Insight and its Outcome.

Then 2 to 4 items. Each item is Insight, then Action, then Outcome, labelled with those words.

Each Action says whether it is in-flight (this campaign) or next period, names an owner (Assembled, the client, or the publisher by name), and a time frame. One Action per Insight. If nothing should change, the Action is "Hold" with the reason.

The Outcome is a number. For work already done, the achieved result. For a recommendation, the expected effect and its basis. Never invent a figure. If it cannot be estimated from the data provided, say what will be measured and when.

Non-negotiables restated:

- Three anchors on every performance claim: target, prior period, benchmark or norm. Name any anchor that is unavailable.
- Decompose mechanics before assigning causes (CPA moved because CPM or CVR moved; CPM moved because of auction, frequency, fatigue, or mix). What and how are the Insight's evidence. Why is its cause. What next is the Action and Outcome.
- Causes: rule out seasonality, promotions, and competitor activity before attributing to our work. State a cause only when the data shows it. Otherwise say what would confirm it.
- Search the AVA Learnings doc for this client's calibrations before writing. Client entries override defaults.
- No jokes anywhere in this flow. This is delivery and money.
- Deck narrative fields carry no free-text dollar amounts. CPM, CPC, CTR, spend pace and 3-second views are assembled by the app.

## The gate: review in chat, then build

Post the full narrative in the chat panel in this order: Summary, delivery review summary, then the Insight, Action and Outcome items. Then stop and ask one question: build the report, or change anything first?

When the app builds the report without chat (Review & Report, scheduled reports), the same structure is returned as JSON for the app to render.

- Edits requested: apply them, restate only what changed, ask again.
- Only on an explicit yes: build the deck. Never generate the file unprompted, and never silently include narrative the user has not seen.

## Stage 4: the report

The deck is the v5 Assembled template, applied by the app. The model supplies text only. Never build or restyle the file. Never use `assets/assembled-template.pptx`.

**In Ava (Assembled View)**: call `generate_performance_report` with `{ period, commentary }`. `commentary` is the approved ReportCommentary: `summary` plus 2 to 4 items of `insight`, `action`, `actionOwner`, `outcome` and `outcomeKind` (`achieved` or `expected`). The server builds the campaign report deck. It does not accept the old execSummary, channels, keyInsight, insights, recs or steps fields. Call it ONLY after the explicit yes at the gate. A dollar amount or percent that is not already in the assembled report is refused (`invented_money_figure`). Near-verbatim restatement of a live prior insight without attributing what was believed before and what has changed is refused the same way (`unattributed_prior_insight`).

On a successful issued report, each commentary item is persisted into `campaign_insights` (source `ava`) with its action, owner and outcome. The summary is not its own row. Insight write failures are fail-soft and never abort the deck.

**In Cowork/Claude**: supply the same text. The app applies the v5 template. Do not load a template file.

The deck is the campaign report on the v5 template: cover, period summary (including the Key metrics block: CPM, CPC, CTR, spend pace, and 3-second views when the delivery snapshot has them), one spend chart and data table per channel, KPI summary, the approved commentary, and the close. The model does not place those figures. Null rates render as a dash.

Slide copy rules: single-line strings per field (no line breaks), Australian English, sentence case, short lines, no em dashes, no filler. Caps: summary 160, insight 240, action 160, outcome 160, actionOwner 40. If the tool rejects a field, tighten the copy. Do not invent a `$` amount or a percent that is not already in the delivery data.

File name: `{client}-{campaign}-report-{yyyy-mm}.pptx`, stored under `exports/reports/{mba}/`.

## The 90% rule

Below ~90% confidence, never guess - ask. This applies at every stage: unknown objective, ambiguous period, data that does not mean what you expected, or two reasonable narratives from the same numbers. Short numbered questions or 2-3 options with a recommendation. A polished wrong report is the worst outcome this skill can produce.

## Failure modes - self-check before the gate

Reject the draft if any of: commentary merely restates the containers; a cause asserted without ruling out alternatives; a miss hidden or softened; pacing judged against end-of-flight instead of expected-to-date; a metric dump instead of the 3-5 metrics that map to the objective; an Action with no owner, or that does not say in-flight or next period; an Outcome with no number and no measurement plan; deck narrative fields containing a dollar amount or a percent that is not already in the delivery data; humour anywhere.

## Learnings and improvement loop

Same loop as the parent skills. Search the AVA Learnings doc before starting; entries tagged `assembled-performance-review-report`, `assembled-insight-commentary`, `assembled-presentations`, or the current client override defaults. When Luke corrects an output, end the response with:

`[LEARNING | assembled-performance-review-report | client | YYYY-MM-DD]` what changed, and the rule going forward.
