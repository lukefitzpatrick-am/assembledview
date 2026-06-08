-- ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace task TSK_REFRESH_PACING_FACT
	warehouse=AV_APP_WH
	after ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH
	as merge into ASSEMBLEDVIEW.MART.PACING_FACT t
using (
  with unioned as (

    select
      channel,
      date_day,
      line_item_name,
      line_item_id,
      entity_name,
      entity_id,
      campaign_name,
      amount_spent,
      impressions,
      clicks,
      results,
      video_3s_views,
      max_fivetran_synced_at::timestamp_ntz as max_fivetran_synced_at
    from ASSEMBLEDVIEW.MART.VW_PACING_DV360
    where date_day >= dateadd(day, -14, current_date())

  ),

  keyed as (
    select
      channel,
      date_day,
      lower(trim(entity_id::string)) as platform_line_item_id,
      line_item_id,
      line_item_name,
      entity_name,
      entity_id,
      campaign_name,
      amount_spent,
      impressions,
      clicks,
      results,
      video_3s_views,
      max_fivetran_synced_at
    from unioned
    where entity_id is not null
      and trim(entity_id::string) <> ''
  ),

  relabel as (
    select
      k.*,
      coalesce(m.line_item_id, k.line_item_id) as final_line_item_id,
      coalesce(m.line_item_name, k.line_item_name) as final_line_item_name
    from keyed k
    left join ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
      on lower(trim(m.channel)) = lower(trim(k.channel))
     and lower(trim(m.platform_line_item_id)) = lower(trim(k.platform_line_item_id))
     and m.is_active = true
  ),

  deduped as (
    select
      channel,
      date_day,
      platform_line_item_id,
      max(final_line_item_id) as line_item_id,
      max(final_line_item_name) as line_item_name,
      max(entity_name) as entity_name,
      max(entity_id) as entity_id,
      max(campaign_name) as campaign_name,
      sum(amount_spent) as amount_spent,
      sum(impressions) as impressions,
      sum(clicks) as clicks,
      sum(results) as results,
      sum(video_3s_views) as video_3s_views,
      max(max_fivetran_synced_at) as max_fivetran_synced_at
    from relabel
    group by 1,2,3
  )

  select *, current_timestamp() as updated_at
  from deduped
) s
on  t.channel = s.channel
and t.date_day = s.date_day
and lower(trim(t.platform_line_item_id)) = lower(trim(s.platform_line_item_id))

when matched then update set
  t.line_item_id           = s.line_item_id,
  t.line_item_name         = s.line_item_name,
  t.entity_name            = s.entity_name,
  t.entity_id              = s.entity_id,
  t.campaign_name          = s.campaign_name,
  t.amount_spent           = s.amount_spent,
  t.impressions            = s.impressions,
  t.clicks                 = s.clicks,
  t.results                = s.results,
  t.video_3s_views         = s.video_3s_views,
  t.max_fivetran_synced_at = s.max_fivetran_synced_at,
  t.updated_at             = current_timestamp()

when not matched then insert (
  channel, date_day, platform_line_item_id,
  line_item_id, line_item_name,
  entity_name, entity_id, campaign_name,
  amount_spent, impressions, clicks, results, video_3s_views,
  max_fivetran_synced_at, updated_at
)
values (
  s.channel, s.date_day, s.platform_line_item_id,
  s.line_item_id, s.line_item_name,
  s.entity_name, s.entity_id, s.campaign_name,
  s.amount_spent, s.impressions, s.clicks, s.results, s.video_3s_views,
  s.max_fivetran_synced_at, current_timestamp()
);
