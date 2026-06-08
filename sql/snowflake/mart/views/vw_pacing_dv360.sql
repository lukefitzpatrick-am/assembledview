-- ASSEMBLEDVIEW.MART.VW_PACING_DV360
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
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

  line_item_name as line_item_name,

  /* relabellable: try extract MBA token, else fallback to fivetran_id */
  lower(trim(
    coalesce(
      nullif(regexp_substr(line_item_name, '[A-Z]{3}AU[0-9]{3,}[A-Z0-9]+'), ''),
      fivetran_id::varchar
    )
  )) as line_item_id,

  line_item_name as entity_name,

  /* immutable platform key */
  lower(trim(fivetran_id::varchar)) as entity_id,

  advertiser_name as campaign_name,

  amount_spent as amount_spent,
  impressions as impressions,
  clicks as clicks,
  results as results,
  video_3s_views as video_3s_views,

  max(fivetran_synced_at) over (partition by date_day) as max_fivetran_synced_at,
  current_timestamp() as updated_at
from ASSEMBLEDVIEW.MART.VW_STG_DV360_PACING;
