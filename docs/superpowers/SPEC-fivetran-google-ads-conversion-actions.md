# Fivetran spec: Google Ads conversions by conversion action (CF2)

Date: 21 Oct 2026. Plan: `PLAN-AV-conversions-roas-2026-10-21` section 3.1, decisions 4, 5 and 13.

## Why

- `AD_GROUP_STATS.CONVERSIONS` mixes every primary action (Jayco AU 26,857 conversions worth $26,293; MyGolf 17,079 worth $128).
- Clients need to pick the actions that count (purchases, leads) in client settings.
- Until this lands, Google offers one event per line: `all_primary`.

## Connector

- Existing Fivetran Google Ads connector, destination schema `GOOGLE_ADS` in `ASSEMBLEDVIEW`.
- Add two custom reports. Table names must match exactly. The SQL guard looks for them.

### Report 1: `AD_GROUP_CONVERSION_ACTION_STATS` (Search and Shopping)

- Report type / resource: `ad_group`
- Fields:
  - `segments.date`
  - `customer.id`
  - `campaign.id`
  - `ad_group.id`
  - `segments.conversion_action`
  - `segments.conversion_action_name`
  - `segments.conversion_action_category`
  - `metrics.conversions`
  - `metrics.conversions_value`
  - `metrics.all_conversions` (kept for checks; the app uses `conversions`)
  - `metrics.all_conversions_value`
- No cost, impressions or clicks. The API rejects them with the conversion action segment.

### Report 2: `CAMPAIGN_CONVERSION_ACTION_STATS` (PMax, campaign grain)

- Report type / resource: `campaign`
- Same fields as report 1 without `ad_group.id`.
- Decision 4: campaign grain accepted. The SQL splits each campaign's conversions over its asset groups by their share of primary conversions that day (then cost, then evenly).

### Sync settings

- Historical sync start: 1 Jan 2026 (decision 13).
- Attribution: Google's own (the conversion action's settings). No change.
- Currency: as reported, no conversion (decision 12). Jayco NZ stays NZD.

## Setup steps for Luke

1. Fivetran > Google Ads connector > Schema / Custom reports > Add report.
2. Create report 1 with the name and fields above. Save.
3. Create report 2 with the name and fields above. Save.
4. Set the historical start to 2026-01-01 for both (connector setup or the report's re-sync).
5. Start the sync. Wait for the first full sync to finish.
6. In Snowsight, run Step 0 of `sql/snowflake/mart/migrations/2026-10-21_cf2_google_conversion_actions_ACCOUNTADMIN.sql` (`DESC TABLE` on both).
   - Expected columns: `DATE`, `CUSTOMER_ID`, `CAMPAIGN_ID`, `AD_GROUP_ID` (report 1 only), `CONVERSION_ACTION`, `CONVERSION_ACTION_NAME`, `CONVERSION_ACTION_CATEGORY`, `CONVERSIONS`, `CONVERSIONS_VALUE`, `_FIVETRAN_SYNCED`.
   - Confidence on Fivetran's column names: 75%. If any differ, send the `DESC` output before running Step 1.
7. Run Step 1 (guarded). It returns `CREATED ...` or `SKIPPED ...`.
8. Run the Step 2 checks. Both must return zero rows.
9. Step 3: add the view to the conversion task (suspend root, re-create task, resume task, resume root).
10. Step 4: one-off backfill of rows older than 14 days.
11. Check MAR in Fivetran after one week. Expect a small multiple of `AD_GROUP_STATS` rows.

## What the app does with it

- Event key: the conversion action resource name (`customers/<id>/conversionActions/<id>`). Label: the action name.
- Category: `PURCHASE` and `STORE_SALE` map to purchase. Lead form, contact, phone call lead, sign-up, appointment, quote and lead imports map to lead. Everything else is other.
- `all_primary` stays available for clients who want the Google total.
- Never pick `all_primary` together with per-action keys for the same client. The settings picker blocks it.

## Risks

- `segments.conversion_action` on the `campaign` resource for PMax: expected to work (campaign grain is the documented fallback). Confidence 85%.
- Fivetran may prefix or rename segment columns. Step 0 catches this.
