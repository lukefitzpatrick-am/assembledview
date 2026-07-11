# Roy Morgan Single Source crosstab - export format and parsing

Documented from a real Assembled Media export ("all people.xlsx", MAR26E1_ASM, April 2026 data). Update this file when new export shapes appear.

## Workbook shape
- One sheet per layer: "All cases" (national) plus state sheets (NSW, Vic, Qld, SA, WA, Tas, Dar-Alce).
- Rows 1-6: metadata. Row 1 source and month ("ROY MORGAN SINGLE SOURCE AUSTRALIA: APR..."), row 3 filter, row 4 weights (projected population), row 6 layer.
- Rows 8-9: banner headers. Row 8 = banner group (e.g. AGE OF MEN, AGE OF WOMEN, SEX), row 9 = column names (TOTAL, Men 14-24, ..., TOTAL Women, ALL PEOPLE 14+, Men, Women).
- Row 11: `(unweighted)` - sample n per column. Row 12: `(POPN '000)` - weighted population per column.
- Row 14: metric labels per column block: `wc`, `v%` (and `z%` on layered/state sheets).
- Row 15+: variable rows grouped under section headings (e.g. "MEDIA CHANNELS - ADDRESSABLE REACH", "MEDIA CHANNELS - TOTAL REACH").
- Footer rows: time-adjustment note, job code, Roy Morgan attribution.

## Metric definitions
- **wc**: weighted count in thousands - the absolute size of the behaviour in that demographic.
- **v%**: vertical percentage - penetration. Share of that column's demographic doing the row behaviour (stored as a decimal, 0.917 = 91.7%).
- **z%**: horizontal percentage - the layer's share of the national row figure (e.g. NSW z% ~0.33 means NSW is a third of national). Only on layered sheets.
- **Index (must be computed)**: (segment v% / base v%) x 100, base normally ALL PEOPLE 14+ on the national sheet. The export does not ship indexes.

## Parsing approach (python + openpyxl)
```python
import openpyxl
wb = openpyxl.load_workbook(path, read_only=True)
ws = wb['All cases']
rows = list(ws.iter_rows(values_only=True))
cols = rows[8]          # column names, row 9 (0-indexed 8)
metrics = rows[13]      # wc / v% / z% labels, row 14
unweighted = rows[10]   # sample sizes
# Build column map: for each named column, note its wc col and the v% col beside it.
# Iterate rows 14+; section headings have a label in col A and no numbers.
# v% values are decimals - multiply by 100 for percentages.
```

## Analysis rules
- Small base flag: unweighted n < 50 in any cell used = indicative only, never a headline.
- Always pair index with absolute size (wc). Index without size misleads; size without index bores.
- Cross-sheet: use state sheets' z% to locate the audience geographically; compare state v% to national v% for genuine state skews (population share alone is not a skew).
- Common variable sections in Assembled exports: media channels addressable reach (7-day video/audio/news/magazines/outdoor/social/cinema, by sub-channel), media channels total reach. Client-specific exports may add attitudes, buying intentions, category usage - same wc/v% structure applies.
- Quote the source correctly: "Roy Morgan Single Source Australia, [month/year], n=[unweighted total]". Population figures are projected '000s and may be time-adjusted.
