# Adding a pacing platform (Snowflake + app)

Use this checklist whenever you onboard a new Ads connector (DV360, TikTok, direct bookings, etc.). **Meta** was added as the second platform after Google Ads following this pattern.

## 1. Find Fivetran tables in Snowflake

In a worksheet with read access to the assembled views:

```sql
SHOW SCHEMAS IN DATABASE ASSEMBLEDVIEW;
SHOW TABLES IN SCHEMA ASSEMBLEDVIEW.<CONNECTOR_SCHEMA>;
```

Note fact tables (e.g. daily stats) and history dimensions used for names (`*_HISTORY`, `AD_INSIGHTS`, etc.). Column names may differ slightly by connector version—align to your actual tables before shipping views.

## 2. Stage views matching the delivery contract

Create **`STG_PACING.V_{platform}_{grain}_DAILY`** view(s) with the **same column list, order, and types** as **`STG_PACING.V_GOOGLE_ADS_AD_GROUP_DAILY`** (canonical contract consumed by **`FACT_DELIVERY_DAILY`**).

Typical grains:

- **Ad group / ad set** — e.g. `group_type = 'ad_set'`, `group_id` from the platform’s ad-set (or equivalent) id.
- **Campaign** — when mappings omit **`group_name_pattern`**, union the campaign-level view with `group_type = 'campaign'`.

Platform-specific examples in repo:

- **`sql/snowflake/pacing/10_stg_meta_daily.sql`** — ad set grain, `platform = 'meta'`.
- **`sql/snowflake/pacing/11_stg_meta_campaign_daily.sql`** — campaign grain.

## 3. Union into `FACT_DELIVERY_DAILY`

Snowflake **dynamic tables** cannot `ALTER` the query body. Use **`CREATE OR REPLACE DYNAMIC TABLE`** and add:

```sql
UNION ALL
SELECT * FROM STG_PACING.V_<PLATFORM>_DAILY
UNION ALL
SELECT * FROM STG_PACING.V_<PLATFORM>_CAMPAIGN_DAILY  -- if applicable
```

See **`sql/snowflake/pacing/12_fact_delivery_daily.sql`** for the current union structure (Google + Meta).

## 4. Refresh downstream dynamic tables

After deploying the new definition:

```sql
ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY REFRESH;
ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH;
```

Adjust database/schema names to match your environment.

## 5. App: `MediaTypeConfig`

In **`lib/pacing/media-type-config.ts`**, add the lowercase **`platform`** string to **`platforms`** under the correct **`media_type`** (and extend **`PLATFORM_LABELS`** if needed). **`performanceColumns`** drives the **Delivery breakdown** table in **`DeliveryPacingDrawer`**.

## 6. Verify end-to-end

1. Create **test `pacing_mappings`** for one client (platform + patterns).
2. Confirm delivery rows in **`/pacing/overview`** and the line-item drawer.
3. Fix any Snowflake column renames (Fivetran drift) in the stage views.

## 7. Documentation

Update **`docs/xano/pacing-api.md`** with the new allowed **`platform`** value and any API notes.
