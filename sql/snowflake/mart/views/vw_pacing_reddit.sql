-- ASSEMBLEDVIEW.MART.VW_PACING_REDDIT
-- Rev 2. Captured from production 2026-09-15. Feeds TSK_REFRESH_SOCIAL_PACING_FACT.
-- Spend is Reddit micros (÷ 1e6). Video views come from AD_GROUP_REPORT;
-- conversions come from the Ad Reporting staging model.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_PACING_REDDIT(
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
  'Social - Reddit' as channel,
  r.date::date as date_day,

  /* Normalise display + join keys — raw Fivetran landing stays immutable. */
  g.name as line_item_name,

  /* relabellable id: trailing "-" token of the ad group name, else ad group id */
  lower(trim(
    coalesce(
      nullif(regexp_substr(g.name, '[^-]+$'), ''),
      r.ad_group_id::varchar
    )
  )) as line_item_id,

  g.name as entity_name,

  /* immutable platform key */
  lower(trim(r.ad_group_id::varchar)) as entity_id,

  c.name as campaign_name,

  coalesce(r.spend, 0) / 1e6 as amount_spent,
  coalesce(r.impressions, 0) as impressions,
  coalesce(r.clicks, 0) as clicks,
  coalesce(s.conversions, 0) as results,
  coalesce(r.video_watched_3_seconds, 0) as video_3s_views,

  r._fivetran_synced as max_fivetran_synced_at,
  current_timestamp() as updated_at
from ASSEMBLEDVIEW.REDDIT_ADS.AD_GROUP_REPORT r
left join ASSEMBLEDVIEW.REDDIT_ADS.AD_GROUP g
  on r.ad_group_id = g.id
left join ASSEMBLEDVIEW.REDDIT_ADS.CAMPAIGN c
  on g.campaign_id = c.id
left join ASSEMBLEDVIEW.AD_REPORTING_STAGING.REDDIT_ADS__AD_GROUP_REPORT s
  on r.ad_group_id::varchar = s.ad_group_id::varchar
 and r.date::date = s.date_day::date;
