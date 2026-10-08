---
name: assembled-presentations
description: Build downloadable, on-brand Assembled Media PowerPoint presentations directly from what is on screen - Assembled View pages, pacing and plan data, commentary, insights, or any brief. Use whenever Luke or AVA asks to create, build, draft, update or restyle any presentation, deck, slides, pitch, proposal, tender response, credentials deck, client report deck, QBR, performance review, board deck or case study slides - even without mentioning "brand" or "template", and especially for "turn this into a deck", "make slides from this page", "export this as a presentation". Every .pptx output for Assembled Media goes through this skill.
metadata:
  version: 1.3.0
---

# Assembled Media presentations - from screen to deck

The app applies the v5 Assembled template. The model supplies text only. Never use `assets/assembled-template.pptx`. Never build from a blank deck, never restyle, and never apply gradients or drop shadows. This skill supersedes assembled-media-pptx: if both are installed, use this one and suggest uninstalling the old. It adds a from-the-screen intake and the Assembled marketing brain.

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

Inside Assembled View, skip this step and follow outline-only mode. Do not call `load_template`. It used to open `assets/assembled-template.pptx`, which is retired.

1. Read a general pptx skill (if available) for mechanics; read `references/slide-catalogue.md` only as a layout list. Brand rules above win.
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

- Never use `assets/assembled-template.pptx`. In Assembled View, follow outline-only mode below. The app applies the v5 template to the text you supply.
- Covers: slides 1 and 2 are logo covers with NO editable text. For a titled opener, follow with a Big Statement slide (12, 15, 16 or 17) carrying title, client, date.
- Fill EVERY text placeholder on every kept slide. If content does not exist, pick a simpler slide.
- Fill by placeholder idx via `fill_by_idx`, never shape order. Run `placeholders(slide)` first; tiny anchor placeholders (under 0.3in) never receive text.
- Match copy length to box width. Template sets text sizes; use `set_text()`. Shorten copy before shrinking fonts.
- Unfilled PICTURE placeholders are the one allowed blank - flag them when presenting.
- Slides 13, 67, 68 ship with example content - replace all of it or avoid them.
- Slide numbers, agenda headings, section structure and logos are baked into layouts. Never re-add.

## Brand

Sand grounds the slides. Ink is the text. Forest, lime and sky are jobs, not decoration: sky marks an Insight, forest marks an Action, lime marks an Outcome. Never use teal, steel blue, purple, emerald, gradients or drop shadows. Headings are sentence case and end in a full stop. Every chart is paired with an insight card. Logos stay as the template draws them. Never recolour, stretch or crowd them.

## Copy style on slides

Australian English. Short direct sentences, dot points over paragraphs. No em dashes. Sentence case headings, each ending in a full stop. Numbers lead. No filler. On a commentary slide the title is the Insight, written as a sentence ending in a full stop. The body is the evidence. The kicker is the Action. Hero numbers carry the Outcome tag. Write plain text. The template applies the tags.

## Deck structure defaults

Cover, then an agenda for decks over about 10 slides, a breaker before each section, sand grounds with ink text, sections internally consistent, case studies when proof helps, next steps, then the end slide.

For performance and QBR decks from screen data: a Summary slide (the lead Insight and its Outcome), delivery vs plan, Insight / Action / Outcome slides, brand indicators, the next period, next steps.

## Learnings and improvement loop

Learnings live in two places:

1. **Live source of truth**: a doc named "AVA Learnings" in the Assembled View project knowledge (or a connected folder). Search for it before starting; entries tagged `assembled-presentations` or the current client override this skill's defaults.
2. **Bundled baseline**: `LEARNINGS.md` in this skill folder - the snapshot folded in when the skill was last reissued.

This skill folder is read-only once installed, so never try to append to it at runtime. When a new learning arises (Luke corrects or edits an output, a client rule emerges, a spec changes in-platform):

- End the response with a formatted entry and ask Luke to add it to the AVA Learnings doc:
  `[LEARNING | assembled-presentations | client | YYYY-MM-DD]` what changed, and the rule going forward.
- When the doc holds ~10+ entries for this skill, suggest reissuing the skill with them folded into `LEARNINGS.md`.
- Template updates: the app owns the v5 template. Never replace or load `assets/assembled-template.pptx`.

## Ava outline-only mode (binding inside Assembled View)

Inside Assembled View there is no python-pptx, no deck_tools.py, no soffice, and no
template binary. Do NOT attempt .pptx generation. Instead:
1. Produce the deck as a structured slide-by-slide outline: for each slide, the layout
   name (from `references/slide-catalogue.md`), title, body content, chart/visual
   description, and speaker notes. The catalogue is a layout list only. Brand rules above win. Never load `assets/assembled-template.pptx`.
2. Source numbers only from tools and the page snapshot; name anything missing.
3. Close by stating that the outline can be turned into the branded .pptx via the
   Claude-side assembled-presentations skill (or a future AV export), and offer the
   outline in a copy-friendly block.
All brand, structure and narrative rules above still apply to the outline.
