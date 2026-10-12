---
name: av-campaign-report-v5
description: builds an Assembled Media campaign performance report deck on the v5 brand from a supplied report-data.json.
---

# Campaign report, v5

Build the deck with `scripts/am_rebrand.py` and `Assembled-Media-Template-v5.potx`. Do not start from a blank Presentation(). Do not fetch anything. The files are already in the input directory.

## Colour

sky = insight, forest = action, lime = outcome.

ink #0F1D13, white, sand #EFE9DF, lime #B5D337, sky #49C7EB, forest #246646, forest light #4E8F6A, panel #1A2620, context #CFC8BA, line #E4DED2, muted #6B6A5E, body #3B4A3F.

Lime text only on ink or panel. On white, lime is a fill, never text.

No gradients, shadows, outline-only boxes, teal, steel blue, purple or emerald. Cards are always filled.

## Type

Plus Jakarta Sans ExtraBold headings, sentence case, ending with a full stop.

One Instrument Serif italic phrase per title, at most. Use `I()`. Never a whole title, never body text.

Titles 36pt (32 for two lines), body 10 to 14pt, never below 8pt.

## Elements and layout

At least two brand elements per slide (arches, pills, filled cards, number dots, Insight/Action/Outcome tags, journey line, arch trio, thin rules).

Alternate white, sand and black grounds.

Keep the content area x 0.6–12.73 in, y 1.95–6.7 in. Keep y > 6.9 clear.

Data: native tables or pill bars with exact figures, plus a sand insight card with an Insight tag.

Voice: Australian English, short sentences, no em dashes, no emojis. Titles state the point.

## Figures

Use only numbers present in report-data.json, exactly as formatted there. Copy each formatted string. Do not round, abbreviate, recompute, or invent a count, percent, date, or dollar figure. Missing values stay "Not yet reported".

## Slide plan

`d = Deck(template)`; `d.save` to `$OUTPUT_DIR/<mbaNumber>.pptx`.

1. Cover, sand: `s = d.clone(3)`. Title = client and campaign with one serif phrase. Subtitle = period. 105-107 = the three uploaded photos as arches (`d.photo(..., kind='arch')`). 102 = `d.photo_slot` for the client logo.
2. Summary: `d.add('Title Only - White')`. One-sentence verdict as the title. Stat row of up to 4 hero numbers (forest on white). Outcome tag.
3. One slide per live channel: `d.add('Title Only - Sand')`. Spend vs expected to date as pill bars. Delivery numbers in filled white cards. Insight tag card.
4. Not yet live: `d.add('Title Only - White')`. One filled card per channel with planned budget and status.
5. KPI vs target: Four cards, or `table()` if more than 4 KPIs. "Not yet reported" stays as text.
6. Insight, action, outcome: `d.add('Title Only - Black')`. Up to 4 rows, each with sky/forest/lime tags, each row under 35 words. If commentary is null, one row from the summary figures only.
7. Appendix: `d.add('Title Only - White')`. `table()` of the delivery rows.
8. Thank you: `d.clone(21)`.

## Run

The input files are in the container's input directory. Find them with one ls. Don't print any file.

Write ONE build script using am_rebrand.py and run it.

Render once: soffice to PDF, pdftoppm -r 40, a single contact sheet PNG. View that one image.

At most ONE fix pass, then re-render only if you changed something.

Never print XML, base64, whole files or directory trees. Pipe any inspection through head -c 2000.

Save the deck to `$OUTPUT_DIR/<mbaNumber>.pptx`.
