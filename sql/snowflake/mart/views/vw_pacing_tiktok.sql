-- ASSEMBLEDVIEW.MART.VW_PACING_TIKTOK
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_PACING_TIKTOK(
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
with latest_adgroup as (
  select
    adgroup_id,
    adgroup_name,
    campaign_id,
    updated_at,
    row_number() over (partition by adgroup_id order by updated_at desc) as rn
  from ASSEMBLEDVIEW.TIKTOK_ADS.ADGROUP_HISTORY
)
select
  'Social - TikTok' as channel,
  r.stat_time_day::date as date_day,

  h.adgroup_name as line_item_name,

  /* relabellable id: suffix if present, else fallback to adgroup_id */
  lower(trim(
    coalesce(
      nullif(regexp_substr(h.adgroup_name, '[^-]+$'), ''),
      r.adgroup_id::varchar
    )
  )) as line_item_id,

  h.adgroup_name as entity_name,

  /* immutable platform key */
  lower(trim(r.adgroup_id::varchar)) as entity_id,

  /* optional: you can swap this to campaign name if you have it available */
  coalesce(h.campaign_id::varchar, null) as campaign_name,

  coalesce(r.spend, 0) as amount_spent,
  coalesce(r.impressions, 0) as impressions,
  coalesce(r.clicks, 0) as clicks,
  coalesce(r.conversion, 0) as results,
  coalesce(r.video_watched_2_s, 0) as video_3s_views,

  r._fivetran_synced as max_fivetran_synced_at,
  current_timestamp() as updated_at
from ASSEMBLEDVIEW.TIKTOK_ADS.ADGROUP_REPORT_DAILY r
left join latest_adgroup h
  on r.adgroup_id = h.adgroup_id
 and h.rn = 1;
