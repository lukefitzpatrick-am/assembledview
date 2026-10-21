# Audit: pacing health and consistency (21 Oct 2026)

Scope: is each online pacing source loading, do the pacing surfaces count to the same day, and data hygiene in the pacing facts. Calculation functions and media plan downloads are audited separately.

Measured 21 Oct 2026, 15:30 to 16:00 Melbourne.

## Commits

| Commit | What changed |
| --- | --- |
| `47c6a527` | Assumed-spend burst days are Sydney civil days. They were keyed a UTC day early. |
| `156f8d6d` | Report deck spend, expected and conversions stop at Melbourne yesterday (`capWindowAtMelbourneYesterday`). The deck window ran to today. |
| `a65e1a42` | Partner-ingest timeouts (programmatic OOH). Already live. |
| `adc96d17` | `SP_REFRESH_ASSUMED_SPEND_DAILY('changed')` "Unsupported subquery type" fix. Needs the AS1 SQL run as well. |

## Source health

| Source | Status | Notes |
| --- | --- | --- |
| DV360 | OK | |
| CM360 | OK | |
| Meta | OK | |
| TikTok | OK | |
| Reddit | OK | |
| Google search, PMax, shopping | OK | |
| Bing | OK, late | Loaded 13:22, after the 08:00 portfolio snapshot. The morning portfolio misses Bing for the prior day. |
| Fixed cost (cpm, cpv, cpc, fixed) | OK | |
| Conversions | OK | |
| Programmatic OOH partner files | STALE since 13 Oct | Partner-ingest timeouts. Fix `a65e1a42` is now live; confirm the next run catches up. |
| Fixed-cost assumed_spend | FROZEN since 13 Oct | `SP_REFRESH_ASSUMED_SPEND_DAILY('changed')` failed with "Unsupported subquery type". 135 lines, 24 campaigns, $203,948.14 short to 20 Oct. Fix `adc96d17` plus the AS1 SQL. |

## Consistency: which day each surface counts to

| Surface | Counts to |
| --- | --- |
| Portfolio | Melbourne today (`getAsOfDate()`) |
| Admin channel tabs | Melbourne today |
| Pacing modal | Melbourne today |
| Ava `get_pacing_snapshot` | Melbourne today |
| Digest | Melbourne today |
| Client campaign strip | Melbourne yesterday |
| Ava `get_delivery_snapshot` | Melbourne yesterday |
| Report deck | Melbourne yesterday (was today, fixed `156f8d6d`) |

The admin and client groups differ by one day of expected spend. Examples on 21 Oct:

| MBA | One-day expected gap |
| --- | --- |
| curatif004 | $645.19 |
| hartm001 | $2,374.80 |
| golf025 | $1,542.97 |
| BICAU006 | $3,422.17 |
| PENFOLD018 | $1,279.37 |
| sinch001 | $4,203.30 |

Decision for Luke: keep admin on today and client on yesterday (and label it), or move every surface to one day.

## Fixed in this run

- Assumed-spend burst days were a UTC day early (`47c6a527`).
- Report deck windows ran to today (`156f8d6d`).

## Hygiene

- 48,986 legacy "Social - Meta" rows in `PACING_FACT`.
- hartm001 search: $157,927.50 dated before the campaign start. Filtered out by date on every surface, so no visible effect.
- Unmapped delivery, last 30 days: Meta $4,815.22, Search $811.35, DV360 $298.08, PMax $210.42.
- golf025, PENFOLD018 and sinch001: portfolio delivered is above the Snowflake facts. Likely CM360 estimates plus assumed spend. Unverified.

## Open questions for Luke

- One as-of day for every surface, or keep the admin / client split?
- Run the AS1 SQL after `adc96d17` and backfill assumed spend from 13 Oct?
- Clear or archive the legacy "Social - Meta" rows?
- Move the portfolio snapshot after Bing lands, or add a later refresh?
- Map the unmapped delivery (Meta $4,815.22 is the largest).
