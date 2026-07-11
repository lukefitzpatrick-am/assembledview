---
name: assembled-video-scripts
description: "Write short-form video ad scripts and hooks the Assembled Media way - TikTok, YouTube (Shorts, skippable in-stream, 6s bumpers), and Reels-format scripts with shot notes, overlays and captions. Use whenever asked for 'video script', 'TikTok ad', 'YouTube ad script', 'bumper', 'pre-roll script', 'UGC script', 'hooks for video', '15 second script', or to iterate video creative from account performance. Writes to platform specs and attention science - hook and brand inside the opening seconds."
metadata:
  version: 1.1.0
---

# Short-form video scripts (TikTok / YouTube / vertical video)

Video is bought by the second and watched by the half-second. The script's first job is to survive the first 2 seconds with the brand attached; everything else is craft on top.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` - client voice, winning hooks, banned angles.
2. Load the **assembled-marketing-brain** skill (if unavailable, say strategic grounding is missing and proceed with extra care). Apply hard: distinctive assets inside the first 1.5-2 seconds (attention threshold drops when branding lands early); a fully watched 6s beats a partially watched 20s; emotional for brand, direct for activation; platform attention ceilings differ - script to the platform.
3. **Research the client.** Client knowledge, then web: site, offers, organic socials (voice), competitor video in TikTok Creative Center and Meta/Google ad libraries.
4. **Check for account access.** If TikTok Ads or Google Ads (YouTube) is linked, pull 30-90 days of video metrics (hook rate/3s views, hold to 50%/100%, CPA) before writing and run Iteration mode. Otherwise ask for data or label output unvalidated.

## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- the platform and placement (TikTok in-feed, Shorts, skippable in-stream, bumper, Reels) - lengths and skip points differ
- the objective (brand vs activation) and the single message the video must land
- who appears on camera (founder, creator/UGC, voiceover only) and what footage exists or can be shot
- the offer/CTA and where it points
- fresh build vs iteration, and which metric decides winners

If any is unknown, or two readings would produce different scripts, stop and ask numbered questions or present 2-3 options with a recommendation. Do not draft on a guess. Flag anything below ~90% confidence.

## Platform specs and skip points (references/specs-and-evidence.md; verified July 2026 - re-verify if 3+ months later)

- TikTok in-feed: 9:16, sound-on culture but caption everything; ad text 80 rec (100 max); native beats polished; first 2 seconds decide.
- YouTube skippable in-stream: skip button at 5s - the hook and brand must land before it. 15-30s typical.
- YouTube bumper: 6s, unskippable, one message only.
- Shorts / Reels: 9:16, under 60s (aim 15-35s), safe zones - keep text out of the top ~14% and bottom ~20-35%.

## Script structure (ABCD, evidence-backed)

Write every script against Google's ABCD framework, adjusted by the brain:

- **Attract**: hook in the first 1-2 seconds - visual surprise, direct address, or the problem in one line. Write 3-5 alternative hooks per script.
- **Brand**: name or distinctive asset by 1.5-2s, and again at the CTA. On TikTok, brand natively (product in hand, decal, spoken name).
- **Connect**: people, faces, voice, one emotion or one concrete proof. One message per video.
- **Direct**: explicit CTA, spoken and on screen.

Script format: two-column (time/shot | VO/dialogue + overlay text), plus caption line and CTA. Overlays 5-7 words, safe-zone compliant. Write for sound-off comprehension (captions carry the argument) and sound-on reward.

## Diversification and iteration

- Deliver 2-4 distinct concepts per brief (e.g. UGC testimonial, founder piece, demo/problem call-out, polished brand cut), each with hook variants - not one script with five synonymous openings.
- Iteration: diagnose with the funnel - weak 3s hook rate = hook problem; good hook, weak 50% hold = middle drags; good hold, weak CTR/CVR = offer or CTA problem. Refresh hooks and first frames on winners before rebuilding concepts.
- Log rounds and output learning entries.

## Compliance quick-flags (Australia)

ACL misleading claims. Alcohol: ABAC (25+ talent, 80%+ adult targeting). Financial: ASIC RG 234. Health: TGA. Testimonials must be genuine and typical; disclose paid partnerships per AANA/ACCC guidance.

## Output format

Per concept: concept name and angle, hook variants (with a one-line visual for each), the two-column script with timestamps, overlay lines, caption text, CTA, and editor notes (cut lengths per placement). See `references/example-output.md`.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: the "AVA Learnings" doc in project knowledge. Entries tagged `assembled-video-scripts` or the current client override defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder, folded in at each reissue.

This skill folder is read-only once installed - never append to it at runtime. When a learning arises, end the response with:
`[LEARNING | assembled-video-scripts | client | YYYY-MM-DD]` what changed, and the rule going forward - and ask Luke to add it to the AVA Learnings doc. At ~10+ entries, suggest reissuing the skill.

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
