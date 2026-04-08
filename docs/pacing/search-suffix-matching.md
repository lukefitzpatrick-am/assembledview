# Search suffix matching (Google Ads)

Paid **search** pacing mappings use `match_type = suffix_id` and an **line item code** (`av_line_item_code`). Snowflake matches that code to the **segment after the last hyphen** in each **ad group** or **asset group** name in delivery data.

## How suffix matching works

1. **Media plan** — Each search line item in `media_plan_search` has a `line_item_id` (e.g. `ACME123SE1`). Sync copies that into `pacing_mappings.av_line_item_id` and `av_line_item_code`.

2. **Google Ads** — For spend to roll up to that line item, **every** ad group (and asset group, where applicable) that should count toward the line must end with that same code after a hyphen, for example:
   - `Brand | Generic - golf001se1` → matched code `golf001se1`
   - The matcher uses `LOWER(TRIM(REGEXP_SUBSTR(group_name, '[^-]+$')))` so only the **final** hyphen-separated segment is used.

3. **Snowflake** — `FACT_LINE_ITEM_PACING_DAILY` joins `FACT_DELIVERY_DAILY` to `DIM_PLAN_MAPPING` with the suffix rule for `suffix_id` rows (see mart SQL migrations under `sql/snowflake/pacing/`).

Codes must be **alphanumeric** (no extra hyphens in the code itself); the hyphen is the **separator** between the human-readable name and the machine id.

## Naming convention for buyers

When building new search campaigns in Google Ads:

- Put the **agreed line item id** (same as in the media plan / Search Line Item card) as the **suffix after the last hyphen** in each relevant **ad group** and **asset group** name.
- Keep the suffix **consistent** across all groups that belong to that AV line item.
- Avoid a second hyphen inside the suffix — the platform treats everything after the **last** hyphen as the code; extra hyphens in the suffix break the match.

## When an ad group has the wrong suffix

1. **Rename** the ad group (or asset group) in Google Ads so the final segment matches `av_line_item_code` / `line_item_id`.
2. Wait for **Fivetran** (or your ETL) to sync the new names into Snowflake `FACT_DELIVERY_DAILY`.
3. Refresh the pacing dynamic tables (order matters: delivery first, then line-item fact):
   - `ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY REFRESH;`
   - `ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH;`
4. In the app, **Pacing → Settings → Resync search mappings** is still useful if Xano `pacing_mappings` is out of sync with `media_plan_search`; it does not fix wrong Google names by itself.

## “No recent delivery” panel (Pacing → Settings)

The panel **Search mappings with no recent delivery** lists active `suffix_id` search mappings that have **no row** in `FACT_LINE_ITEM_PACING_DAILY` for the **last 7 days** (up to 50 rows). That usually means one of:

| Situation | What to do |
|-----------|------------|
| **Typo** in the code vs Google ad group suffix | Fix naming in Google Ads (above), wait for ETL, refresh dynamic tables. |
| **Campaign paused / no spend** | Expected empty list until delivery resumes; confirm mapping is still correct. |
| **Renamed groups** in Google without updating suffix | Rename to restore the line item id as the final segment. |
| **New mapping** before first delivery | Wait for delivery; if still listed after spend should exist, check names. |

The same diagnostic query runs at the end of the one-off script:

`npx tsx scripts/pacing/backfill-search-mappings.ts`

Use **`--dry-run`** on that script to preview how many rows would be created/updated/deactivated **without** writing to Xano or Snowflake (`POST /api/pacing/mappings/sync-from-search-containers` with `{ "dry_run": true }` does the same via the API).

## Related paths

- Backfill script: `scripts/pacing/backfill-search-mappings.ts`
- Shared SQL strings: `lib/pacing/searchMappingsVerificationSql.ts`
- API: `GET /api/pacing/search-mappings-no-recent-delivery`, `POST /api/pacing/mappings/sync-from-search-containers`
