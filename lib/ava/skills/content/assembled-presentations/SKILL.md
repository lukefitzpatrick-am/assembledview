---
name: assembled-presentations
description: Build downloadable, on-brand Assembled Media PowerPoint presentations directly from what is on screen - Assembled View pages, pacing and plan data, commentary, insights, or any brief. Use whenever Luke or AVA asks to create, build, draft, update or restyle any presentation, deck, slides, pitch, proposal, tender response, credentials deck, client report deck, QBR, performance review, board deck or case study slides - even without mentioning "brand" or "template", and especially for "turn this into a deck", "make slides from this page", "export this as a presentation". Every .pptx output for Assembled Media goes through this skill.
metadata:
  version: 1.2.0
---

# Assembled Media presentations - from screen to deck

All decks are built FROM the bundled brand template (`assets/assembled-template.pptx`), never from scratch. The template carries the real theme, layouts, logo placements and backgrounds, so decks are on brand by construction. This skill supersedes assembled-media-pptx: if both are installed, use this one and suggest uninstalling the old. It adds a from-the-screen intake and the Assembled marketing brain.

## Before starting

1. Search project knowledge for the "AVA Learnings" doc and read `LEARNINGS.md` - deck preferences, client-specific structures, past corrections.
2. Load the **assembled-marketing-brain** skill for any deck with strategy, planning or results content (if unavailable, say strategic grounding is missing and proceed with care). If the deck contains performance commentary, build the narrative with the **assembled-insight-commentary** skill first, then pour it into slides.


## Clarify before proceeding (the 90% rule)

Assembled's rule: below ~90% confidence, never guess - ask. Before producing anything, confirm you know:

- who the deck is for and the decision it must drive
- the expected length and the sections required
- that every number going onto a slide exists on the page or in provided files (never re-derive)
- co-branding requirements (client logo covers, slide 2 vs 1)

If any of these is unknown, the data does not mean what you expected, or two reasonable interpretations would produce different deliverables, stop. Ask short, numbered questions, or present 2-3 options with a recommendation, and wait for direction. Do not produce a draft on a guess. This beats a polished wrong answer every time. When delivering judgement calls, state your confidence and flag anything below ~90%.
## Step 1: intake from the screen

The main data is what is on the page. In order of preference:
- Data visible in the conversation or on the Assembled View screen (tables, pacing, KPIs, commentary): extract every figure exactly as shown. Never re-derive or invent numbers.
- Uploaded files (xlsx/pdf/screenshots): read and extract.
- Gaps: list what is missing for the chosen slide structure and ask, or choose simpler slides. A half-filled slide looks broken; a simpler slide does not.

Turn the raw content into a slide narrative before any code: what is the one-line story of this deck, what are the 3-5 sections, what does the client decide at the end. Decks argue; they do not just display.

## Step 2: build workflow

1. Read a general pptx skill (if available) for mechanics; read `references/slide-catalogue.md` to choose slides for the narrative.
2. Map each content section to a template slide number - cover, agenda, breakers, content slides, next steps, end slide - before writing code.
3. Build with `scripts/deck_tools.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(SKILL_DIR, 'scripts'))
from deck_tools import (load_template, duplicate_slide, keep_slides,
                        set_text, fill_by_idx, placeholders)
prs = load_template()
# a) duplicate any slide type needed more than once (copies append to the end)
# b) run placeholders(slide) on each slide type to see idx, geometry and purpose
# c) fill with fill_by_idx(slide, {idx: text}) - NEVER fill by shape order
# d) keep_slides(prs, [ordered 0-based indices]) LAST - it prunes and orders
prs.save('<outputs>/<name>.pptx')
```

4. Verify: render thumbnails (soffice) and visually check overflow, empty placeholders and colours before presenting. If soffice is unavailable, say the deck ships visually unverified and list what to eyeball.
5. Deliver: save to the outputs folder and present the file for download. Say which picture placeholders were left for photos/client logos.

## Key rules (non-negotiable)

- Never build from a blank Presentation(). Always `assets/assembled-template.pptx`.
- Covers: slides 1 and 2 are logo covers with NO editable text. For a titled opener, follow with a Big Statement slide (12, 15, 16 or 17) carrying title, client, date.
- Fill EVERY text placeholder on every kept slide. If content does not exist, pick a simpler slide.
- Fill by placeholder idx via `fill_by_idx`, never shape order. Run `placeholders(slide)` first; tiny anchor placeholders (under 0.3in) never receive text.
- Match copy length to box width. Template sets text sizes; use `set_text()`. Shorten copy before shrinking fonts.
- Unfilled PICTURE placeholders are the one allowed blank - flag them when presenting.
- Slides 13, 67, 68 ship with example content - replace all of it or avoid them.
- Slide numbers, agenda headings, section structure and logos are baked into layouts. Never re-add.

## Brand tokens

Fonts: Aptos SemiBold headings, Aptos body (in the theme - do not override).
Colours: Ink #0F1D13, White #FFFFFF, Lime #B5D337 (primary accent, key numbers), Emerald #008E5E, Forest #246646, Teal #15C7C9, Sky #49C7EB, Steel blue #4F8FCB, Purple #472477 (sparingly).
Chart series order: lime, emerald, teal, sky, steel blue, purple, forest. Axis text #0F1D13 on white, white on black. Matplotlib charts: transparent backgrounds, this palette.
Logos: baked into layouts; bundled PNGs only for non-template contexts. Never recolour, stretch or crowd them.

## Copy style on slides

Australian English. Short direct sentences, dot points over paragraphs. No em dashes. Sentence case headings. Numbers lead ("164% enquiry uplift", styled lime on dark). No filler. Commentary slides follow the insight ladder: the slide title is the insight, the body is the evidence, the kicker is the action.

## Deck structure defaults

Cover (1, or 2 for co-branded pitches) - Agenda (3) for decks over ~10 slides - breaker before each section, rotating variants - alternate white/black sparingly, sections internally consistent - case studies (67/68) when proof helps - Next steps (49/50) - End (20).

For performance/QBR decks from screen data: summary statement slide (the BLUF), delivery vs plan, the how/why commentary section, brand indicators, next period plan, next steps.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: a doc named "AVA Learnings" in the Assembled View project knowledge (or a connected folder). Search for it before starting; entries tagged `assembled-presentations` or the current client override this skill's defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder - the snapshot folded in when the skill was last reissued.

This skill folder is read-only once installed, so never try to append to it at runtime. When a new learning arises (Luke corrects or edits an output, a client rule emerges, a spec changes in-platform):

- End the response with a formatted entry and ask Luke to add it to the AVA Learnings doc:
  `[LEARNING | assembled-presentations | client | YYYY-MM-DD]` what changed, and the rule going forward.
- When the doc holds ~10+ entries for this skill, suggest reissuing the skill with them folded into `LEARNINGS.md`.
- Template updates: when the brand template changes, replace `assets/assembled-template.pptx`, re-check `references/slide-catalogue.md`, and reissue the skill.

## Ava outline-only mode (binding inside Assembled View)

Inside Assembled View there is no python-pptx, no deck_tools.py, no soffice, and no
template binary. Do NOT attempt .pptx generation. Instead:
1. Produce the deck as a structured slide-by-slide outline: for each slide — layout
   name (from `references/slide-catalogue.md`), title, body content, chart/visual
   description, and speaker notes.
2. Source numbers only from tools and the page snapshot; name anything missing.
3. Close by stating that the outline can be turned into the branded .pptx via the
   Claude-side assembled-presentations skill (or a future AV export), and offer the
   outline in a copy-friendly block.
All brand, structure and narrative rules above still apply to the outline.
