-- ASSEMBLEDVIEW.MART.VW_PACING_META
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_PACING_META(
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
with actions as (
  select
    adset_id,
    date::date as date_day,
    sum(case
      when lower(action_type) in ('3_sec_video_view','video_view','thruplay')
      then coalesce(value,0) else 0 end
    ) as video_3s_views,
    sum(case
      when lower(action_type) in ('link_click','inline_link_click','outbound_click')
      then coalesce(value,0) else 0 end
    ) as action_clicks,
    sum(case
      when lower(action_type) in (
        'purchase','lead','complete_registration','offsite_conversion',
        'onsite_conversion','omni_purchase','omni_lead'
      )
      then coalesce(value,0) else 0 end
    ) as results
  from ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD_SET_ACTIONS
  group by 1,2
)
select
  'Social - Meta' as channel,
  b.date::date as date_day,

  b.adset_name as line_item_name,

  /* relabellable id: your suffix if present, else fallback to adset_id */
  lower(trim(
    coalesce(
      nullif(regexp_substr(b.adset_name, '[^-]+$'), ''),
      b.adset_id::varchar
    )
  )) as line_item_id,

  b.adset_name as entity_name,

  /* immutable platform key */
  lower(trim(b.adset_id::varchar)) as entity_id,

  b.campaign_name as campaign_name,

  coalesce(b.spend, 0) as amount_spent,
  coalesce(b.impressions, 0) as impressions,
  coalesce(b.inline_link_clicks, a.action_clicks, 0) as clicks,
  coalesce(a.results, 0) as results,
  coalesce(a.video_3s_views, 0) as video_3s_views,

  b._fivetran_synced as max_fivetran_synced_at,
  current_timestamp() as updated_at
from ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD_SET b
left join actions a
  on b.adset_id = a.adset_id
 and b.date::date = a.date_day;
