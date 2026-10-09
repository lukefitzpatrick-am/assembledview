---
name: assembled-brand
description: "Brand rules for Assembled Media writing: palette jobs, type, tone, logos and the never-use list. Load before a deck, document or social post. Call get_brand_assets for logos and photos and use those URLs. Never invent an image URL."
metadata:
  version: 1.0.0-av
---

# Assembled Media brand

Use this for anything written in the Assembled Media brand. It sets the rules. AVA writes the words. The app applies the v5 template to campaign reports. Do not run Python, download a kit, or build a Canva or Word file.

For logos and photos, call get_brand_assets and use the returned URLs. Never invent an image URL.

When the writing is a case study, big numbers, a data slide or an insight card, call load_skill again with reference `create-patterns`. Load that reference only then.

## Colour

| Token | Hex | Job |
|---|---|---|
| ink | #0F1D13 | Text, black grounds |
| white | #FFFFFF | Ground |
| sand | #EFE9DF | Context ground, filled cards, table headers |
| lime | #B5D337 | Outcome. Primary buttons, focus ring, hero numbers on black |
| sky | #49C7EB | Insight |
| forest | #246646 | Action. Secondary buttons, numbers on white, links |
| forest light | #4E8F6A | Forest on black grounds |
| panel | #1A2620 | Cards on black |
| context | #CFC8BA | Rules and empty slots on sand |
| line | #E4DED2 | Hairlines on white |
| muted | #6B6A5E | Captions, sources |
| muted on black | #AEB9B0 | Captions on black |
| body | #3B4A3F | Long body text |

Rules:
- sky = insight, forest = action, lime = outcome. Keep those jobs in charts, tags and dots.
- Alternate white, sand and black grounds for rhythm.
- Lime text only on ink or panel. On white, lime is a fill, never text.
- Never use teal, steel blue, purple, emerald, gradients or drop shadows.

## Type

- Headings: Plus Jakarta Sans ExtraBold, sentence case, ending with a full stop.
- Body: Plus Jakarta Sans Regular. Bold for emphasis, sparingly.
- Instrument Serif Italic for one human phrase per headline. Never a whole headline, never body text.
- No all-caps headings, no eyebrows or section labels above titles.

Fallbacks when the brand fonts are not available: Aptos for Jakarta, Georgia italic for the serif. Email: Arial, then Georgia italic.

Sizes for the words you write:
- Deck titles state the point in one sentence. Body stays short. Never ask for type below 8pt.
- Documents: one sentence per heading, body in short paragraphs.
- Web: one serif italic phrase in the title, body around 17px.

## Elements

Use at least two in every slide, page or post you describe:
- arches (rounded top, square base)
- pills
- the lime focus ring, one per photo, on a face, hands or product
- filled cards: white on sand, sand on white, panel on black
- colour dots and number dots
- Insight / Action / Outcome tags (sky / forest / lime pills)
- journey lines with coloured dots
- the arch trio (sky, forest, lime, rising left to right)
- lime primary buttons and forest outline secondary buttons
- thin rules

Never:
- outline-only boxes (cards are always filled)
- gradient circles or fills, glows, drop shadows
- icon rows or clip art
- full-bleed photos behind text
- thin all-caps serifs
- stretched or recoloured logos

## Photography

The rule is "People mid-decision": real Australians scrolling, choosing, moving and enjoying what they bought. Full colour, natural light, close and candid, looking at their world, not the camera.

- Client work beats stock. Then the brand library from get_brand_assets. Then nothing (use brand elements instead).
- Never use metaphor stock: piggy banks, coins, compasses, rulers, gears, chess, jenga, handshakes, lightbulbs, plants in jars, arrows on blackboards.
- Never use hands-on-laptop stock, night city or neon, AI swirls or abstract 3D renders.
- Crop people into arches or pills. Only landscapes take wide rounded rectangles.
- Pick with get_brand_assets. Themes in the catalogue include shopping, phones, delivery, work, family, sport, travel and regional.
- Do not generate AI images of people for brand work. If nothing fits, leave a labelled slot for the team.

## Logo

- Full colour on white and sand, inverted white on black and forest, one-colour ink when only one colour prints, grayscale when the ground is grey.
- Clear space stays empty. Never crowd the logo with text or photos.
- The template already places the logo. Do not add a second one on the same page.
- Take the file from get_brand_assets. Never invent a logo URL.

## Charts and data

- Tables or labelled figures, never a pasted chart image.
- Bars and pills in forest, sky and lime by job. Grey (#CFC8BA) for context series.
- No gridlines beyond thin rules. Label values directly. Source in muted type under the chart.
- Pair every chart with an insight card that states the "so what".

## Voice

- Australian English. Short, direct sentences.
- Plain words: "we buy media for you, not us", not "we leverage synergistic solutions".
- Titles state the point. Numbers carry their source.
- No emojis or em dashes.
- Avoid: seamless, synergistic, utmost, tapestry, leverage, robust, cutting-edge, game-changer, unlock.

## Brand check before delivering

Confirm:
- Only brand colours, used for their jobs
- Headings in sentence case with a full stop, one serif italic phrase at most
- Two or more brand elements, no outline boxes, no gradients or shadows
- Photos are people mid-decision or client work, from get_brand_assets, faces not cut
- Logo is the right version, has clear space, appears once
- Numbers have sources, copy is Australian English, no emojis or em dashes
- Anything to add by hand is flagged in a checklist
