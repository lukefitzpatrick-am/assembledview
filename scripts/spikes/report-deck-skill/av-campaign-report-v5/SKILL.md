---
name: av-campaign-report-v5
description: builds an Assembled Media campaign performance report deck on the v5 brand from a supplied report-data.json.
---

# Campaign report, v5

Build the deck with the scripts in this skill and `Assembled-Media-Template-v5.potx`. Do not start from a blank Presentation(). Do not fetch anything. The files are already in the input directory.

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

Use only numbers present in report-data.json, exactly as formatted there. Copy each formatted string. Do not round, abbreviate, recompute, or invent a count, percent, date, or dollar figure. Pace percents are already whole numbers. CTR, conversion rate, VTR and time elapsed stay at two decimal places. Missing values stay "Not yet reported".

A label whose text is "Spend pace" is shown as "Spend pace of expected to date". Write the short label. The builder appends the rest.

## content.json

You choose every variant and write every word. The builder copies each formatted string from a key. A value field is a dotted path from `summarise.py`, never a typed number. Prose is a string, or a list of strings and `{"k":"path"}`. No digits in prose. The builder turns `{i:"phrase"}` in a title into the one serif phrase. Do not call `I()` yourself.

Title: max 60 characters, one `{i:"phrase"}`, ends with a full stop. Limits: label 24, note 48, list note 80, outcome 160, support 140, insight 160, body 200, card body 120, status 48, button 24, card title 32, column 18. Insight, action and outcome text: max 35 words.

- cover `sand` (clone 3) or `black` (clone 2). Fields: `title`, `subtitle` (key). Arch photos 105–107. Client logo slot 102.
- summary `stat-row` (Title Only - White): `title`, `stats` (up to 4 of `label`, `key`, `note`), `outcome`. Or `statement` (Statement - Black): `title`, `support`.
- channel, one per live channel. `bars` (Title Only - Sand): `title`, `spend`, `expected`, `spendLabel`, `expectedLabel`, `delivery` (up to 4 of `label`, `key`), `insight`. `cards` (Three Cards): `title`, `cards` (exactly 3 of `title`, `key`, `body`). `photo` (Photo and Text): `title`, `value`, `body`, `photo` (0, 1 or 2).
- not-live `cards` for one or two channels: `title`, `cards` (`label`, `budget`, `status`, optional `note`). `list` only for three or more: `title`, `rows` (`label`, `budget`, `note`) with number dots.
- kpi `four-cards`: `title`, `cards` (up to 4 of `label`, `actual`, `target`). `table`: `title`, `rows` (same fields), `insight` (max 160). The table sits with a sand insight card.
- iao `rows` (Title Only - Black): `title`, `rows` (up to 4 of `tag` insight, action or outcome, and `text`) with sky, forest and lime tags. `journey`: `title`, `steps` (exactly 3 of `label`, `text`) on a journey line.
- appendix `table`: `title`, `columns`, `rows` (each cell a key), `insight` (max 160). The table sits with a sand insight card.
- close `thank-you` (clone 21): `title`. `cta` (Title Only - Black): `title`, `support`, `button`, an arch trio and a lime button.

## Run

Scripts live in `/skills/av-campaign-report-v5/scripts/`. Run `ls "$INPUT_DIR"` once to learn the photo filenames.

1. `python /skills/av-campaign-report-v5/scripts/summarise.py "$INPUT_DIR/report-data.json"`
2. Pipe the content JSON into `python /skills/av-campaign-report-v5/scripts/write_content.py`. It checks variant names, character limits and value keys, writes `content.json`, and prints OK or the errors. Do not use jq. Do not use a heredoc.
3. `python /skills/av-campaign-report-v5/scripts/build_report.py content.json "$INPUT_DIR/report-data.json" "$INPUT_DIR/Assembled-Media-Template-v5.potx" "$OUTPUT_DIR/<mbaNumber>.pptx" "$INPUT_DIR/<photo1>" "$INPUT_DIR/<photo2>" "$INPUT_DIR/<photo3>" && python /skills/av-campaign-report-v5/scripts/check_deck.py "$OUTPUT_DIR/<mbaNumber>.pptx" "$INPUT_DIR/report-data.json" content.json`
4. If check reports issues, change the content and pipe it through `write_content.py` once, then rerun step 3.
5. Save to `$OUTPUT_DIR/<mbaNumber>.pptx`.

Never view or open images. Never read am_rebrand.py, build_report.py or check_deck.py. Never print files. Never write your own build script.
