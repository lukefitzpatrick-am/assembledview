---
name: assembled-meta-copy
description: Write Meta (Facebook/Instagram) hooks and ad copy the Assembled Media way - primary text, headlines, descriptions, hook lines for video and statics, and text overlays. Use whenever asked for "Meta ads", "Facebook ad copy", "Instagram ads", "hooks", "ad angles", "primary text", "creative copy for socials", refreshing fatigued Meta creative, or iterating from a linked Meta Ads account or pasted performance data. Researches the client first, writes to current specs and flexible-ad structures, diversifies angles properly, and iterates on what has worked.
metadata:
  version: 1.2.0
---

# Meta copy and hooks

On Meta the hook is the media plan: the first 3 seconds of video and the first ~125 characters of primary text decide whether anything else exists. Diversified concepts are the targeting mechanism.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` - client hooks that have won, banned angles, compliance rules.
2. Load the **assembled-marketing-brain** skill (if unavailable, say strategic grounding is missing and proceed with extra care). Apply it hard here: distinctive brand assets inside the first 1.5 seconds (the attention threshold drops when branding lands early); emotional storytelling for brand objectives, direct offer clarity for activation; diversify across the whole category buyer, not a persona sliver.
3. **Research the client.** Client knowledge first (briefs, prior ads, LEARNINGS), then web: the client's site and offers, their organic socials (voice), competitor ads in Meta Ad Library on the same category.
4. **Check for account access.** If a Meta connection/MCP is linked, pull 30-90 days of ad-level results (hook rate = 3-second views / impressions, hold rate, CTR, CPA/ROAS by concept) before writing - then run Iteration mode. Otherwise ask for an export/paste, or proceed in Generate mode and label the copy unvalidated.


## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- the campaign objective (activation vs brand) - it changes the copy style entirely
- the offer, landing page and proof points (verified, not assumed)
- the creative formats being produced (video, static, carousel) and who is making them
- the compliance category, and whether Advantage+ text enhancements are on or off
- fresh build vs iteration, and which metric decides winners

If any of these is unknown, the data does not mean what you expected, or two reasonable interpretations would produce different deliverables, stop. Ask short, numbered questions, or present 2-3 options with a recommendation, and wait for direction. Do not produce a draft on a guess. This beats a polished wrong answer every time. When delivering judgement calls, state your confidence and flag anything below ~90%.
## Specs and structures (verified July 2026 - detail in references/specs-and-evidence.md)

- Primary text: hook must land inside ~125 characters (Feed "See more" fold). Headline field has no cap worth relying on; keep ~27-30 chars to avoid mobile clipping. Description ~30 chars, only some placements.
- Flexible ads: up to 10 media, 5 primary texts, 5 headlines, 5 descriptions mixed per user. Default deliverable: 5/5/5 per concept, each genuinely different in angle.
- Advantage+ text generation can rewrite copy - recommend off for regulated clients; review enhancement toggles per campaign.
- 9:16 safe zones: keep text out of roughly the top 14% and bottom 20-35%. Overlay headlines 5-7 words max.

## Writing the set

1. **Concepts before copy.** 3-5 distinct concepts per brief, diversified across hook x format x messenger x message (e.g. founder story, UGC-style testimonial, problem call-out demo, polished brand spot, objection-handler). Near-duplicates get throttled by delivery (Andromeda) - diversity is the point.
2. **Hooks per concept.** Write 3-5 hook lines per concept from the frameworks: problem call-out, stat/social proof lead, contrarian/myth-bust, curiosity gap, before/after, objection pre-empt, straight offer. First 125 characters carry the whole idea.
3. **Primary texts (5).** Different lengths and angles: one short punch (under 125), one story, one proof-stack, one objection-handler, one offer-led. Line breaks for readability. 1-2 emojis max, only if on-voice.
4. **Headlines (5) and descriptions (5).** Headlines = CTA or value statement, under 30 chars preferred. Descriptions = secondary proof.
5. **Overlay lines.** 5-7 words, safe-zone compliant, brand asset visible from frame one.

## Iteration mode

1. Rank concepts by hook rate first, then CPA/ROAS. Diagnose separately: weak hook rate = hook problem; strong hook, weak CTR/CVR = body or offer problem.
2. Refresh hooks and first frames on winning concepts before rebuilding whole concepts. Fatigue signal: frequency above ~3 or 2-4 weeks old and CPA drifting.
3. Keep a portfolio: never let the account converge on one style. Retire the bottom, feed the top, always test 1-2 wildcards.
4. Log the round and append pattern learnings to `LEARNINGS.md`.

## Compliance quick-flags (Australia)

ACL misleading claims. Alcohol: ABAC (25+ people depicted, 80%+ adult audience targeting, no success/mood claims). Financial: ASIC RG 234 balance and warnings. Health: TGA. Meta special ad categories where applicable. Flag unsubstantiated claims rather than writing them.

## Output format

Per concept: concept name and angle, hook lines, 5 primary texts (total char count and hook count inside the 125 fold), 5 headlines, 5 descriptions, overlay line, and notes for the editor/designer. See `references/example-output.md`.

Voice: Australian English, no em dashes, short sentences, concrete nouns, numbers tied to outcomes - unless the client's calibrated voice in LEARNINGS says otherwise.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: a doc named "AVA Learnings" in the Assembled View project knowledge (or a connected folder). Search for it before starting; entries tagged `assembled-meta-copy` or the current client override this skill's defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder - the snapshot folded in when the skill was last reissued.

This skill folder is read-only once installed, so never try to append to it at runtime. When a new learning arises (Luke corrects or edits an output, a client rule emerges, a spec changes in-platform):

- End the response with a formatted entry and ask Luke to add it to the AVA Learnings doc:
  `[LEARNING | assembled-meta-copy | client | YYYY-MM-DD]` what changed, and the rule going forward.
- When the doc holds ~10+ entries for this skill, suggest reissuing the skill with them folded into `LEARNINGS.md`.
- Staleness check: specs verified July 2026. If today is more than ~3 months later, re-verify flexible ads, Advantage+ and safe zones before quoting them.

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
