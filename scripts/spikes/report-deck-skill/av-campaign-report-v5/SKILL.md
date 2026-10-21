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

Use only numbers present in report-data.json, exactly as formatted there. Copy each formatted string. Do not round, abbreviate, recompute, or invent a count, percent, date, or dollar figure. Pace percents are already whole numbers. Results, conversions, clicks and impressions are whole numbers with thousands separators. Spend, CPM, CPC, CPA, CTR, conversion rate, VTR and time elapsed stay at two decimal places. Missing values stay "Not yet reported". Chart points are data. Never copy a chart point into prose.

## content.json

You choose every variant and write every word. The builder copies each formatted string from a key. A value field is a dotted path from `summarise.py`, never a typed number. Prose is a string, or a list of strings and `{"k":"path"}`. No digits in prose. The builder turns `{i:"phrase"}` in a title into the one serif phrase. Do not call `I()` yourself.

Title: max 60 characters, one `{i:"phrase"}`, ends with a full stop. Limits: label 24, note 48, list note 80, outcome 160, support 140, insight 160, body 200, card body 120, status 48, button 24, card title 32, column 18, recommendation heading 40, recommendation body 220. Insight, action and outcome text: max 35 words. A recommendation body is two or three lines.

A label whose text is "Spend pace" is shown as "Spend pace of expected to date". Write the short label. The builder appends the rest.

- cover `sand` (clone 3) or `black` (clone 2). Fields: `title`, `subtitle` (key). Arch photos 105–107. The Assembled Media logo stays. An empty client logo slot is not drawn.
- breaker `black` (clone 5), one slide, directly after the cover, only when the deck has 5 or more slides. Field: `title` (max 60, one serif phrase). Black ground, one arch photo, bar motif bottom right.
- summary `stat-row` (Title Only - White): `title`, `stats` (up to 4 of `label`, `key`, `note`), `outcome`. Or `statement` (Statement - Black): `title`, `support`.
- conversions: when report-data.json has a `conversions` object, the builder adds the client's headline (Purchases, Leads or Conversions), plus Revenue and ROAS when `showRevenue` is true, as a row under the summary `stat-row` stats and after the fixed stats on each channel `chart` slide. Do not repeat them in `stats`. Prose may cite `summary.conversions.count`, `summary.conversions.revenue` and `summary.conversions.roas` with `{"k":"path"}`.
- chart `delivery` (Title Only - White): one slide, directly after the summary, on every deck that has charts. Fields: `title`, `chart` (`charts.0`; the campaign chart is always index 0), `stats` (up to 4 of `label`, `key`), `insight`.
- channel, one per live channel. `chart` is the default when that channel has a chart, on the same layout as delivery. Fields: `title`, `chart`, `insight`. Stats are fixed: Spend, Impressions, Clicks, CTR. `cards`: four cards (`body` only), `channel` (`channels.<i>.label`), `insight`, only when the channel has no chart. `bars` (Title Only - Sand): `title`, `spend`, `expected`, `spendLabel`, `expectedLabel`, `delivery` (up to 4 of `label`, `key`), `insight`. `photo` (Photo and Text): `title`, `value`, `body`, `photo` (0, 1 or 2). A channel in the payload's `notLive` list does not get its own slide. Name it in the summary Outcome. A summary, KPI or rates slide may mention it.
- kpi `four-cards`: `title`, `cards` (up to 4 of `label`, `actual`, `target`). `table`: `title`, `rows` (same fields), `insight` (max 160). The table sits with a sand insight card.
- iao `rows` (Title Only - Black): `title`, `rows` (up to 4 of `tag` insight, action or outcome, and `text`) with sky, forest and lime tags. `journey`: `title`, `steps` (exactly 3 of `label`, `text`) on a journey line.
- detail `table` (Title Only - White): when `detailLevel` is `line_item` or `ad_group`, add one slide per `detail` entry, directly after that channel's slide. Fields: `title`, `detail` (`detail.<i>`), `insight`. When `detailLevel` is `channel` or `detail` is empty, do not add detail slides. The builder draws the rows. The insight names what stands out, using `{"k":"path"}` references to the row values. No digits in prose.
- creative `grid` (Title Only - White): only when report-data.json has `creatives`. One slide on `creatives.campaign`, directly after the delivery chart slide. When `detailLevel` is `line_item` or `ad_group`, you may add a `creatives.lines.<i>` slide directly after that line's detail slide, at most 3 of them. Fields: `title`, `creatives` (`creatives.campaign` or `creatives.lines.<i>`), `insight`. The builder draws up to 3 cards with the thumbnail, name, platform, ad set, metrics and a View ad link. The insight names what stands out using `{"k":"path"}` references such as `creatives.campaign.rows.0.ctr`. No digits in prose. The creative-<n>.jpg files are placed by the builder; never pass them to build_report.py.
- appendix `table`: `title`, `columns`, `rows` (each cell a key), `insight` (max 160). The table sits with a sand insight card.
- recommendations `cards`, one slide, directly before the thank-you, on every deck. `title`, `cards` (2 or 3 of `heading` max 40, `body` max 220 and two or three lines), `outcome` (max 160). Sand cards sized to the copy. Numbered circles run sky, forest, then lime. Each card has an Action tag at the bottom. Below the cards, a lime Outcome pill and one line. Two cards leave the bar motif on the right.
- close `thank-you` (clone 21): `title`. `cta` (Title Only - Black): `title`, `support`, `button`, an arch trio and a lime button.

## Run

Scripts live in `/skills/av-campaign-report-v5/scripts/`. Run `ls "$INPUT_DIR"` once to learn the photo filenames.

1. `python /skills/av-campaign-report-v5/scripts/summarise.py "$INPUT_DIR/report-data.json"`
2. Pipe the content JSON into `python /skills/av-campaign-report-v5/scripts/write_content.py "$INPUT_DIR/report-data.json"`. It checks variant names, character limits, value keys, and that a slide whose own channel is in `notLive` is rejected. Summary, KPI and rates slides may name that channel. Each error is one line and names the slide number, the field, the rule and the fix. It writes `content.json` and prints OK or the errors. Do not use jq. Do not use a heredoc.
3. `python /skills/av-campaign-report-v5/scripts/build_report.py content.json "$INPUT_DIR/report-data.json" "$INPUT_DIR/Assembled-Media-Template-v5.potx" "$OUTPUT_DIR/<mbaNumber>.pptx" "$INPUT_DIR/<photo1>" "$INPUT_DIR/<photo2>" "$INPUT_DIR/<photo3>"`
4. If `write_content.py` prints errors, change only the named fields and pipe it again. At most 3 attempts. Do not split, bisect, or rebuild the deck in pieces. Do not write files anywhere except `content.json` and `$OUTPUT_DIR`. If the third attempt still fails, drop the failing slides, build with the last valid content, and save the deck anyway.
5. Save to `$OUTPUT_DIR/<mbaNumber>.pptx`.

Never view or open images. Never read am_rebrand.py, build_report.py or check_deck.py. Never print files. Never write your own build script.
