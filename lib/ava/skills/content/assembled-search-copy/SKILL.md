---
name: assembled-search-copy
description: Write Google Search ad copy to spec the Assembled Media way - Responsive Search Ads (RSA) headlines, descriptions and paths, plus Performance Max text assets. Use whenever asked to write, refresh, expand or iterate search ads, "RSA headlines", "search copy", "Google ads copy", "text ads", ad copy for a search campaign, or to review/iterate live search ads from a linked Google Ads account or pasted performance data. Researches the client first, writes to verified character specs, and iterates on what has worked when account data is available.
metadata:
  version: 1.2.0
---

# Search copy (Google RSAs)

Write search copy that fills the auction's requirements and the buyer's mind: keyword relevance for the query, distinctive brand early, benefit-led variety, and assets that stand alone in any combination.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` - client vocab, banned terms, past winners.
2. Load the **assembled-marketing-brain** skill (if unavailable, say strategic grounding is missing and proceed with extra care). Search is activation: it harvests mental availability. Copy should be clear, direct and offer-led, with the brand name present as a distinctive asset. Do not write brand-campaign poetry into a 30-character headline.
3. **Research the client.** In order: client knowledge on hand (briefs, sites, prior ads, LEARNINGS entries); then web-search the client's site, offers, differentiators, competitor ads on the same terms. Confirm: the offer, the landing page, the proof points (reviews, years, "Australian owned"), and anything regulated.
4. **Check for account access.** If a Google Ads connection/MCP is linked, pull the last 30-90 days of ad and asset performance for the ad group before writing - then run Iteration mode below. If not linked, ask for a paste/CSV of asset performance, or proceed in Generate mode and say the copy is unvalidated by account data.


## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- the ad group keywords and match intent this copy must serve
- the offer, the landing page and the proof points (verified, not assumed)
- the compliance category (financial, alcohol, health, none)
- whether this is a fresh build or an iteration, and which metric decides winners

If any of these is unknown, the data does not mean what you expected, or two reasonable interpretations would produce different deliverables, stop. Ask short, numbered questions, or present 2-3 options with a recommendation, and wait for direction. Do not produce a draft on a guess. This beats a polished wrong answer every time. When delivering judgement calls, state your confidence and flag anything below ~90%.
## Specs (verified July 2026 - see references/specs-and-evidence.md for detail and updates)

- Headlines: up to 15, 30 characters each (minimum 3). Descriptions: up to 4, 90 characters each (minimum 2). Paths: 2 x 15 characters.
- Up to 3 headlines + 2 descriptions serve; H2, H3 and D2 are never guaranteed. Any compliance/must-show text must be pinned to H1, H2 or D1.
- Enhanced flexibility means Google can reuse assets across positions and formats: every asset must stand alone in any combination. No two-part headlines.
- AI Max / text customization can generate extra assets from the landing page; for regulated clients recommend it stays off, and set text guidelines (brand voice rules, banned terms) where it is on.

## Writing rules (evidence-based)

- Mix per RSA (15 headlines): 2-3 keyword-relevance, 4-5 benefit/outcome, 2-3 proof/trust (numbers, reviews, origin), 2-3 CTA/offer, 1-2 differentiator, 1 brand name.
- Shorter headlines outperform: aim most under ~20 characters.
- Sentence case, not Title Case (correlational evidence but consistent and free).
- Ignore Ad Strength as a KPI - it is a completeness heuristic and does not correlate with CPA/CVR. Never sacrifice a proven asset to chase "Excellent".
- Pin only for compliance; if pinning, pin 2-3 alternatives to the same position to keep rotation.
- Descriptions: each one a complete thought - benefit + proof + CTA. No "learn more about our solution" wastage.
- Each asset genuinely different in angle, not synonyms of one idea.
- Numbers do the talking: "From $89", "4.8 stars, 2,100 reviews", "Since 1998".
- Australian English. No em dashes anywhere in copy or output.

## Iteration mode (when performance data exists)

1. Rank assets by the metric that matters (ask: CPA, CVR, CTR, ROAS).
2. Identify winning themes, structures and lengths; identify the flat angles.
3. Keep proven assets untouched. Replace the bottom third with: fresh variants of winning themes, plus 1-2 untested angles.
4. Log the round in the output (what was kept, retired, tested) and append the pattern learnings to `LEARNINGS.md` under the client.

## Compliance quick-flags (Australia)

ACL: no misleading claims; a disclaimer cannot cure a misleading headline. Financial services: ASIC RG 234 - balance returns with risk, pin required warnings to guaranteed positions. Alcohol: ABAC. Health: TGA. When a claim needs substantiation we do not have, flag it rather than writing it.

## Output format

Per ad group: headlines numbered with character counts, descriptions with counts, paths, pinning notes, then a CSV block for bulk upload (Google Ads Editor columns). Over-limit lines flagged and trimmed. See `references/example-output.md`.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: a doc named "AVA Learnings" in the Assembled View project knowledge (or a connected folder). Search for it before starting; entries tagged `assembled-search-copy` or the current client override this skill's defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder - the snapshot folded in when the skill was last reissued.

This skill folder is read-only once installed, so never try to append to it at runtime. When a new learning arises (Luke corrects or edits an output, a client rule emerges, a spec changes in-platform):

- End the response with a formatted entry and ask Luke to add it to the AVA Learnings doc:
  `[LEARNING | assembled-search-copy | client | YYYY-MM-DD]` what changed, and the rule going forward.
- When the doc holds ~10+ entries for this skill, suggest reissuing the skill with them folded into `LEARNINGS.md`.
- Staleness check: specs verified July 2026. If today is more than ~3 months later, re-verify RSA specs and AI Max changes before quoting them.

## Minimal mode (Ava / Assembled View — binding when external research is unavailable)

Inside Assembled View, web search, ad libraries, creative centers and linked ad
accounts are NOT available. In that environment:
1. Skip every web/account research step above. Do not simulate it and never fill the
   gap from memory.
2. Ground the work in what the tools provide instead: client details
   (`get_client_details`), saved audiences (`get_saved_audiences`), best practice
   (`get_best_practice`), platform specs (`get_platform_specs` — character limits and
   formats come from there, never from memory), campaign context and the page snapshot.
3. State explicitly, at the top of the output, which research steps were omitted and
   what the user could paste to close the gap (e.g. competitor ads, account exports).
4. The 90% rule still applies: if a required input is missing and no tool holds it,
   ask — one question per turn.
