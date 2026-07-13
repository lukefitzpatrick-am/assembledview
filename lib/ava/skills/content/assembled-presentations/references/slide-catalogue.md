# Assembled Media template - slide catalogue

The bundled template (`assets/assembled-template.pptx`) contains 68 pre-built slides.
Numbers below are 1-indexed as shown in PowerPoint. Subtract 1 when using python-pptx.

Every slide is 16:9 widescreen (12192000 x 6858000 EMU). The logo, page furniture and
background treatments are baked into the slide layouts - never add logos manually to
slides built from this template.

## Opening

| # | Name | Use for |
|---|------|---------|
| 1 | Title 1 | Default cover: animated dot mark + wordmark. NO editable text - use as-is |
| 2 | Title with client | Logo x client lockup cover. Client logo placement, no editable text |
| 3 | Agenda | Agenda / contents. "Agenda." heading baked in. 5 agenda items as number + text pairs (idx 11-15 numbers, idx 16-20 text - see idx map below). Fill both halves of every pair used |
| 4 | Team x 4 | Team intro, 4 people (title + name/role text placeholders) |
| 5 | Team x 6 | Team intro, 6 people (title + 6 picture placeholders + text) |

## Section breakers

| # | Name | Use for |
|---|------|---------|
| 6 | Breaker 1 - White | Section divider, white background, dot motif variant 1 |
| 7 | Breaker 2 - Black | Section divider, black background, variant 2 |
| 8 | Breaker 3 - White | Section divider, white, variant 3 |
| 9 | Breaker 4 - Black | Section divider, black, variant 4 |
| 10 | Breaker Custom Image - White | Divider with a picture placeholder, white |
| 11 | Breaker Custom Image - Black | Divider with a picture placeholder, black |

Each breaker has 2 body placeholders: section number/label and section title.
Alternate breaker variants through a deck rather than repeating one.

## Statements

| # | Name | Use for |
|---|------|---------|
| 12 | Big - Statement Black | Single bold statement, black background |
| 13 | Big - Statement Add Picture | Statement + portrait photo (contains a sample photo - replace it) |
| 14 | Big - Statement Add Picture | Statement + picture placeholder |
| 15 | Big - Statement Rainbow | Statement over multi-colour brand treatment |
| 16 | Big - Statement Lime | Statement on lime (#B5D337) |
| 17 | Big - Statement Forrest | Statement on forest green (#246646) |

## Utility

| # | Name | Use for |
|---|------|---------|
| 18 | Blank - White | Blank canvas, white, with one body placeholder. Base for fully custom content, tables, diagrams |
| 19 | Blank - Black | Blank canvas, black |
| 20 | End Slide | Closing slide (no placeholders, logo lockup baked in) |

## Key message ("Imp") slides

| # | Name | Use for |
|---|------|---------|
| 21 | Imp Slide - Green | Important callout, green treatment |
| 22 | Imp Slide - Black | Important callout, black |
| 23 | Imp Slide - White | Important callout, white |
| 24 | Demand Flow Planning | Proprietary Demand Flow Planning framework slide |

## Multi-point content slides (the workhorses)

| # | Name | Placeholders |
|---|------|--------------|
| 25 | Say 4 Things | 4 pictures + text blocks |
| 26 | Say Three Things | Title + content object + 4 text placeholders |
| 27-32 | Narrative / flexible content | Statement text placeholder + large content object area. Good for diagram or image-led narrative slides |
| 33 | Say Two Things - White | Title + 2 text blocks |
| 34 | Say Two Things - Black | Title + 2 text blocks |
| 35 | Say Three Things - White | Title + 3 text blocks |
| 36 | Say Three Things - Black | Title + 3 text blocks |
| 37 | Say Four Things - White | Title + 4 text blocks |
| 38 | Say Four Things - Black | Title + 4 text blocks |
| 39 | Say Two Things with Pic - White | Title + 2 text + 2 picture placeholders |
| 40 | Say Two Things with Pic - Black | Title + 2 text + 2 picture placeholders |
| 41 | Say Three Things with Pic - White | Title + 3 text + 3 picture placeholders |
| 42 | Say Three Things with Pic - Black | Title + 3 text + 3 picture placeholders |
| 43 | Say Four Things with Pic - White | Title + 4 text + 3 picture placeholders |
| 44 | Say Four Things with Pic - Black | Title + 4 text + 3 picture placeholders |

In "Say N Things" slides, each point usually has a heading placeholder and a body
placeholder - inspect with `placeholders(slide)` before writing.

## Strategy / narrative slides

| # | Name | Use for |
|---|------|---------|
| 45 | 1_Title 1 - Light | Word-wall slide, white: 10 short text placeholders over coloured blocks. Use for value lists / capability walls, one short phrase each |
| 46 | 2_Title 1 - Light | Same, dark background |
| 47 | Total Addressable Market | TAM / market sizing, light |
| 48 | Total Addressable Market - Dark | TAM, dark |
| 49 | Next step | Next steps / timeline, light (8 placeholders: steps + labels) |
| 50 | Next step - Dark | Next steps, dark |
| 51 | 3_Go-to-market | GTM / phased plan |
| 52 | 4_Quote - Dark | Quote / testimonial, dark |
| 53 | HVA Placemat | High-value action placemat (8 text blocks) |
| 54 | 1_HVA Placemat | Placemat variant |
| 55 | 1_Business model | Business/commercial model, light |
| 56 | Business model - Dark | Commercial model, dark, with picture |

## Data slides

| # | Name | Use for |
|---|------|---------|
| 57 | 1 Big Graph - White | One full-width chart/graph (content object) + heading + commentary |
| 58 | 1 Big Graph - Black | Dark variant |
| 59 | 1 Chart Bottom Text - White | Native chart placeholder, commentary below |
| 60 | 1 Chart Bottom Text - Black | Dark variant |
| 61 | 1 Chart Top Text - White | Commentary above, chart below |
| 62 | 1 Chart Top Text - Black | Dark variant |
| 63 | 2 Charts Top Text - White | Two chart placeholders side by side + commentary |
| 64 | 2 Charts Top Text - Black | Dark variant |
| 65 | 2 Charts - White | Two charts, minimal text |
| 66 | 2 Charts - Black | Dark variant |

## Case studies

| # | Name | Use for |
|---|------|---------|
| 67 | Case Study - Black | Case study: client logo + hero picture placeholders, headline metric title, results panel. Ships with sample Jayco content - replace everything |
| 68 | Case Study - White | Light variant, same warning |

## Hard-won notes

- Empty TEXT placeholders render blank. Fill every text placeholder on kept slides
  or swap to a slide with fewer placeholders.
- Empty PICTURE placeholders are invisible in renders - safe to leave for manual photo drops.
- Breakers: first placeholder is the section number ("01"), second is the section title.
- "Say N Things" numbered structure (1/2/3 markers, divider rules) is baked into the
  layouts - only supply the point text.
- Verify every finished deck by converting to PDF with soffice and viewing page images
  before presenting the file.

## Placeholder idx maps for key slides

Agenda (slide 3): idx 10 = "Agenda" heading, idx 11-15 = item numbers ("01".."05",
1in boxes), idx 16-20 = agenda item text (3.9in boxes). Fill numbers AND items.

Next step (slides 49/50): idx 0 = title, idx 37/39/41/43 = step names,
idx 38/40/42/44 = month + description under each step ("Month\nDetail" format).
idx 31/32/34/35 are tiny timeline anchors - never fill.

For any other multi-placeholder slide, run `placeholders(slide)` and read the
layout prompt text before filling.
