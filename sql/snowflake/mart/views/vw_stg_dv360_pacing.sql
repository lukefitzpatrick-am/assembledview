-- ASSEMBLEDVIEW.MART.VW_STG_DV360_PACING
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_STG_DV360_PACING(
	DATE_DAY,
	ADVERTISER_NAME,
	ADVERTISER_CURRENCY,
	MEDIA_TYPE,
	INSERTION_ORDER,
	LINE_ITEM_NAME,
	IMPRESSIONS,
	CLICKS,
	RESULTS,
	AMOUNT_SPENT,
	VIDEO_3S_VIEWS,
	FIVETRAN_SYNCED_AT,
	FIVETRAN_ID
) as
select
  date::date                                 as date_day,
  advertiser                                 as advertiser_name,
  advertiser_currency                         as advertiser_currency,
  upper(media_type)                          as media_type,
  insertion_order                            as insertion_order,
  line_item                                  as line_item_name,

  impressions::number                        as impressions,
  clicks::number                             as clicks,
  total_conversions::float                   as results,

  /* Spend field choice.
     If TOTAL_MEDIA_COST_ADVERTISER_CURRENCY is your true spend, use that instead. */
  cost_adv_currency::float                   as amount_spent,

  /* Placeholder mapping.
     Use the best DV360 video metric you have for "3s". */
  complete_views_video::number               as video_3s_views,

  _fivetran_synced::timestamp_ntz            as fivetran_synced_at,
  _fivetran_id                                as fivetran_id
from ASSEMBLEDVIEW.GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING
where date is not null;
