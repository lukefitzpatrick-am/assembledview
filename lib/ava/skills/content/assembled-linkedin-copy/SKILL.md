---
name: assembled-linkedin-copy
description: Write LinkedIn ad copy to spec the Assembled Media way - intro text, headlines, descriptions, carousel cards, message ads and thought leader ad framing. Use whenever asked for "LinkedIn ads", "LinkedIn copy", "B2B ad copy", "sponsored content copy", "InMail copy", intro text or headlines for a LinkedIn campaign, or to iterate live LinkedIn ads from account data. Researches the client first, writes to current specs, and applies the B2B evidence base (46:54, out-of-market buyers) from the marketing brain.
metadata:
  version: 1.1.0
---

# LinkedIn copy

LinkedIn is a low-frequency, high-cost, professional-context feed. Most of the audience is out-of-market today, so the copy's first job is to be remembered for the buying situation, not to close. Write for the 95% who will buy later and the 5% ready now, and know which ad is doing which.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` - client voice, banned claims, past winners.
2. Load the **assembled-marketing-brain** skill (if unavailable, say strategic grounding is missing and proceed with extra care). B2B applications: budget optimum near 46:54 brand-to-activation; category entry points matter more than product features; distinctive assets and the brand name early; emotional and fame effects work in B2B too.
3. **Research the client.** Client knowledge first, then web: their site, positioning, proof points (customers, awards, data), competitors' LinkedIn ads (LinkedIn Ad Library) and organic voice.
4. **Check for account access.** If a LinkedIn Ads connection is linked, pull 30-90 days of creative-level results before writing and run Iteration mode. Otherwise ask for an export/paste, or say the copy is unvalidated by account data.

## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- the objective (brand/memory vs lead gen vs event) - it changes format and copy style
- who the buying group is (roles, seniority) and what job the product does for them
- the offer and landing page or lead form (verified, not assumed)
- the format being bought (single image, video, carousel, document, message ad, thought leader)
- fresh build vs iteration, and which metric decides winners

If any of these is unknown, or two reasonable interpretations would produce different deliverables, stop. Ask short, numbered questions, or present 2-3 options with a recommendation, and wait for direction. Do not produce a draft on a guess. State confidence on judgement calls; flag anything below ~90%.

## Specs (see references/specs-and-evidence.md; verified July 2026 - if today is 3+ months later, re-verify before quoting)

- Single image/video: intro text ~150 chars before truncation (600 max) - hook inside 150. Headline 70 rec (200 max). Description ~100 chars, shows mainly on Audience Network.
- Carousel: intro 255 max, card headlines 45, 2-10 cards - each card one idea, sequence tells one story.
- Message ads: subject 60, body 1,500, CTA button 20. Not available in some regions (EU); check availability.
- Text ads: headline 25, description 75.
- Thought leader ads: boosted member posts - write in the person's voice, not the brand's.

## Writing rules

- Hook inside the first 150 characters: name the audience or their situation, then the tension. Job-specific language they recognise; no consumer hype.
- Stats and specifics outperform adjectives. "Cut reporting from 5 days to 4 hours" beats "streamline workflows".
- Brand early: the name or asset inside the intro text's first line for brand work.
- Headlines: clear value statement or CTA, under 70 chars, front-loaded for mobile.
- One idea per ad. Diversify angles across the set (proof, problem, contrarian, peer story, category education) rather than paraphrasing one idea five ways.
- For lead gen: state what the person gets and what it costs them (time, form length). Qualify in the copy to protect lead quality.
- Australian English, no em dashes. Professional but human; write like a sharp colleague, not a brochure.

## Iteration mode

1. Rank creatives by the deciding metric (CTR for reach/brand formats, cost per qualified lead for lead gen - not raw CPL).
2. Identify winning angles and formats; refresh intros and headlines on winners before rebuilding; test 1-2 new angles per round.
3. Log the round and output learning entries.

## Compliance quick-flags (Australia)

ACL misleading claims. Financial services: ASIC RG 234. Employment/HR products: avoid discriminatory targeting implications. Flag unsubstantiated claims rather than writing them.

## Output format

Per campaign: angle-grouped intro texts (char count to the 150 fold), headlines with counts, descriptions, card sequences for carousels, and notes on which format each belongs to. See `references/example-output.md`.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: the "AVA Learnings" doc in project knowledge. Entries tagged `assembled-linkedin-copy` or the current client override defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder, folded in at each reissue.

This skill folder is read-only once installed - never append to it at runtime. When a learning arises, end the response with:
`[LEARNING | assembled-linkedin-copy | client | YYYY-MM-DD]` what changed, and the rule going forward - and ask Luke to add it to the AVA Learnings doc. At ~10+ entries, suggest reissuing the skill.

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
