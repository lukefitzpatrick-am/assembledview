---
name: av-campaign-report
description: builds an Assembled Media campaign performance report deck from a supplied report-data.json.
---

# Campaign performance report

Follow the bundled Assembled Media pptx workflow in `references/assembled-media-pptx.md` (template slides, `fill_by_idx`, `keep_slides`, render and check). Read `references/slide-catalogue.md` before choosing slides. Build with `scripts/deck_tools.py`. Never start from a blank `Presentation()`.

This container does not have `/mnt/skills/public/pptx/SKILL.md` or `/mnt/user-data/outputs/`. General pptx mechanics are in `/skills/pptx/SKILL.md`. The finished deck goes in the container output directory, which is the `$OUTPUT_DIR` environment variable (a `/files/output/...` path that changes every run). `soffice` is `/usr/bin/soffice`.

Read `report-data.json` from the container input directory (`$INPUT_DIR`). Use that file only.

## Inspection limits

These rules override `references/assembled-media-pptx.md` and the comments in `scripts/deck_tools.py`.

- Never print a whole file or a whole tool listing. Pipe every inspection through `head -c 4000` or an equivalent summary (counts, names, or the first lines only).
- Use `references/slide-catalogue.md` to choose slides. Don't enumerate the placeholders of every template slide. Call `placeholders()` only on the slides being used, after `keep_slides`.
- Don't base64 or print images or XML.

`assets/assembled-template.pptx` is not inside the skill bundle. It is supplied next to the report as `assembled-template.pptx` in `$INPUT_DIR`. Copy that file to `assets/assembled-template.pptx` before `load_template()`.

## Slide plan

1. Cover, then a Big Statement slide with the client, campaign and period.
2. Summary with a one-sentence verdict and stat tiles.
3. One slide per live channel.
4. One not-yet-live slide.
5. KPI vs target.
6. At most 4 Insight, Action, Outcome rows, under 35 words each.
7. Appendix tables.
8. End slide.

A channel is live when `notLive` is false. Put every channel with `notLive` true on the single not-yet-live slide.

## Numbers

Use only numbers present in `report-data.json`, formatted as given. Copy each numeral string exactly, including the full decimal. Do not round, abbreviate, recompute, or invent a count, percent, date, or dollar figure. If a placeholder has no numeral in the file, use words and leave the numeral out.

## Finish

Render with `/usr/bin/soffice` and check every slide for overflow, empty placeholders, and contrast before finishing. Save the deck as `$OUTPUT_DIR/<mba>.pptx`, using the `mbaNumber` from `report-data.json`.
