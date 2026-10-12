---
name: assembled-media-pptx
description: Build every PowerPoint presentation on the Assembled Media brand - correct template, colours, fonts and logos. Use this skill whenever Luke asks to create, build, draft, update or restyle any presentation, deck, slides, pitch, proposal deck, tender response deck, credentials deck, client report, QBR, performance review deck, board deck, or case study slides - even if he does not mention "brand", "template" or "Assembled Media". Any .pptx output for Luke goes through this skill.
---

# Assembled Media branded presentations

All decks are built FROM the bundled brand template, not from scratch. The template
carries the real Assembled Media theme, layouts, logo placements and background
treatments, so decks built this way are on brand by construction.

## Build workflow

1. Read `/mnt/skills/public/pptx/SKILL.md` for general pptx mechanics if not already read.
2. Read `references/slide-catalogue.md` to choose slides for the deck's narrative.
3. Plan the deck: map each content section to a template slide number. Get the flow
   right before writing code - cover, agenda, breakers between sections, content
   slides, next steps, end slide.
4. Build with `scripts/deck_tools.py`:

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
prs.save('/mnt/user-data/outputs/<name>.pptx')
```

5. Verify: render thumbnails of the finished deck (soffice) and visually check for
   overflowing text, empty placeholders and wrong colours before presenting the file.

Key rules:
- Never build an Assembled deck from a blank `Presentation()` - always start from
  `assets/assembled-template.pptx`.
- Covers: slides 1 and 2 are logo covers with NO editable text (the wordmark is
  vector art and the dot mark is an animated video). Use them as-is. For a titled
  opener, follow the cover with a Big Statement slide (12, 15, 16 or 17) carrying
  the deck title, client name and date.
- Fill EVERY text placeholder on every slide you keep. Empty placeholders render
  blank in the final deck, so a half-filled slide (e.g. Next step with only a
  title) looks broken. If content does not exist for a placeholder-heavy slide,
  choose a simpler slide instead.
- Fill by placeholder idx (`fill_by_idx`), never by shape order. Shape order does
  not match visual order. Run `placeholders(slide)` first: it shows idx, position
  and size, and flags tiny decorative anchor placeholders (under 0.3in) that must
  never receive text. The layout's prompt text (visible via
  `slide.slide_layout` placeholders) tells you what each idx is for.
- Match copy length to box width shown by `placeholders()` - a 1in box fits a
  two-digit number, a 2.5in box fits a short phrase, not a sentence.
- Placeholder text sizes are set in the template. Use `set_text()` to preserve them.
  If text overflows, shorten the copy first; only reduce font size as a last resort.
- Unfilled PICTURE placeholders are the one exception - they render invisibly and
  can be left for Luke to drop in photos or client logos. Say so when presenting.
- Slides 13 (statement portrait) and 67/68 (case studies, contain sample Jayco
  content) ship with example content - replace all of it or avoid those slides.
- Slide numbering, "Agenda." headings, section structures and logos are baked into
  the layouts. Never re-add them.

## Brand tokens

Fonts (already in the template theme - do not override):
- Headings: Aptos SemiBold
- Body: Aptos

Colours:

| Role | Hex | Notes |
|------|-----|-------|
| Ink / dark background | #0F1D13 | Near-black green. Dark slide backgrounds, body text on light |
| White | #FFFFFF | Light backgrounds, text on dark |
| Lime (primary accent) | #B5D337 | Signature brand colour. Highlights, key numbers, first chart series |
| Emerald | #008E5E | Accent 1 |
| Forest | #246646 | Accent 2, dark green panels |
| Teal | #15C7C9 | Accent 3 |
| Sky | #49C7EB | Accent 4 |
| Steel blue | #4F8FCB | Accent 5 |
| Purple | #472477 | Accent 6, use sparingly |

Chart series order: lime, emerald, teal, sky, steel blue, purple, forest.
Charts on white slides use #0F1D13 for axis text; on black slides use white.
For matplotlib-generated chart images use transparent backgrounds and the palette above.

## Logos

Logos are baked into the template layouts - do not add them to template slides.
Only use the bundled logo files for non-template contexts (e.g. a custom diagram,
an exported one-pager):

- `assets/logo-inverted-white.png` - white wordmark + lime dots, for dark backgrounds
- `assets/logo-full-colour.png` - black wordmark + lime dots, for white/light backgrounds
- `assets/logo-grayscale.png` - mono contexts only

Never recolour, stretch, or place logos on low-contrast backgrounds. Maintain clear
space around the logo of at least the height of the dot motif.

## Copy style

- Australian English spelling (optimise, colour, programme where appropriate)
- Short, direct sentences. Dot points over paragraphs on content slides
- No em dashes anywhere. Hyphens in compound words only
- Headings in sentence case
- Numbers do the talking: lead with the metric where one exists (e.g. "164% enquiry
  uplift"), styled in lime on dark slides
- No filler openers or closers on slides

## Deck structure defaults

Unless asked otherwise:
- Cover (slide 1, or slide 2 for co-branded client pitches)
- Agenda (slide 3) for decks over ~10 slides
- Breaker before each major section, rotating breaker variants
- Alternate white and black content slides sparingly for rhythm - keep sections
  internally consistent
- Case study slides (67/68) whenever credentials or proof points are relevant
- Next steps (49/50) then End slide (20) to close
