-- ASSEMBLEDVIEW.MART.VW_PACING_DV360
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
-- 2026-10-20 FX1: reads new-style plan ids (hartm001PD1, golf025PV1) as well as
-- old-style ids (BICAU002PV1), and keys each DV360 line item on a stable hash
-- instead of FIVETRAN_ID. FIVETRAN_ID is different on every raw row (every day),
-- so it could neither match a plan line nor hold a relabel. Run
-- sql/snowflake/mart/migrations/2026-10-20_fx1_dv360_rekey_and_rebuild_ACCOUNTADMIN.sql
-- straight after this view, before the next TSK_REFRESH_PACING_FACT run.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_PACING_DV360(
	CHANNEL,
	DATE_DAY,
	LINE_ITEM_NAME,
	LINE_ITEM_ID,
	ENTITY_NAME,
	ENTITY_ID,
	CAMPAIGN_NAME,
	AMOUNT_SPENT,
	IMPRESSIONS,
	CLICKS,
	RESULTS,
	VIDEO_3S_VIEWS,
	MAX_FIVETRAN_SYNCED_AT,
	UPDATED_AT
) as
select
  case
    when upper(media_type) = 'DISPLAY' then 'Programmatic - Display'
    when upper(media_type) = 'VIDEO'   then 'Programmatic - Video'
    else 'Programmatic - DV360'
  end as channel,

  date_day as date_day,

  /* Normalise display + join keys — raw Fivetran landing stays immutable. */
  lower(trim(line_item_name)) as line_item_name,

  /* relabellable plan id, case-insensitive:
     1. old style: three letters, AU, digits, code (BICAU002PV1)
     2. new style: MBA (3 to 6 letters + 3 digits) + line code + number
        (hartm001PD1, golf025PV1). Same line codes as the MBA regex in
        creative_web_search_views.sql.
     3. else the stable entity key below, never FIVETRAN_ID. */
  lower(trim(
    coalesce(
      nullif(regexp_substr(upper(line_item_name), '[A-Z]{3}AU[0-9]{3,}[A-Z0-9]+'), ''),
      nullif(regexp_substr(lower(line_item_name), '[a-z]{3,6}[0-9]{3}(prod|pb|pa|pd|po|pv|ml|tv|np|sm|ra|mg|cn|dd|da|dv|bv|it|se|oh|in)[0-9]+'), ''),
      md5(
        lower(trim(coalesce(advertiser_name, ''))) || '|' ||
        lower(trim(coalesce(insertion_order, ''))) || '|' ||
        lower(trim(coalesce(line_item_name, '')))
      )
    )
  )) as line_item_id,

  lower(trim(line_item_name)) as entity_name,

  /* stable platform key: one per DV360 line item (advertiser, insertion order,
     line item name). The DV360 report has no line item id column. This is what
     PACING_FACT.PLATFORM_LINE_ITEM_ID and LINE_ITEM_LABEL_MAP key on. */
  md5(
    lower(trim(coalesce(advertiser_name, ''))) || '|' ||
    lower(trim(coalesce(insertion_order, ''))) || '|' ||
    lower(trim(coalesce(line_item_name, '')))
  ) as entity_id,

  advertiser_name as campaign_name,

  amount_spent as amount_spent,
  impressions as impressions,
  clicks as clicks,
  results as results,
  video_3s_views as video_3s_views,

  max(fivetran_synced_at) over (partition by date_day) as max_fivetran_synced_at,
  current_timestamp() as updated_at
from ASSEMBLEDVIEW.MART.VW_STG_DV360_PACING;
