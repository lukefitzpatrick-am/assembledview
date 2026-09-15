-- ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
-- Applied 2026-09-15 (ACCOUNTADMIN), map join aggregated 2026-09-16. Capture only; this file is
-- not applied by the commit.
-- Feeds TSK_REFRESH_PACING_FACT. RESULTS = plays on this channel only (SUM(PLAYS)).
-- Line attribution at read time: file code or RAW.PARTNER_LINE_MAP. Unmapped rows stay in RAW.
-- The map join aggregates to one row per (SOURCE_SLUG, PARTNER_CAMPAIGN_ID). Snowflake does not
-- enforce the map's primary key, and a seed INSERT replayed three times tripled every delivery
-- figure on 2026-09-15. Never join a map table here without collapsing it first.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH(
  CHANNEL, DATE_DAY, LINE_ITEM_NAME, LINE_ITEM_ID, ENTITY_NAME, ENTITY_ID, CAMPAIGN_NAME,
  AMOUNT_SPENT, IMPRESSIONS, CLICKS, RESULTS, VIDEO_3S_VIEWS, MAX_FIVETRAN_SYNCED_AT
) as
with rows as (
  select d.REPORT_DATE, d.PARTNER_CAMPAIGN_ID, d.PARTNER_CAMPAIGN_NAME,
         d.AMOUNT_SPENT, d.IMPRESSIONS, d.PLAYS, d.LOADED_AT,
         lower(trim(coalesce(
           regexp_substr(d.AV_LINE_ITEM_ID, '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i'),
           m.AV_LINE_ITEM_ID
         ))) as resolved_line_item_id
  from ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY d
  left join (
    select SOURCE_SLUG, PARTNER_CAMPAIGN_ID, max(AV_LINE_ITEM_ID) as AV_LINE_ITEM_ID
    from ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
    where IS_ACTIVE
    group by SOURCE_SLUG, PARTNER_CAMPAIGN_ID
  ) m
    on m.SOURCE_SLUG = 'vistar'
   and m.PARTNER_CAMPAIGN_ID = d.PARTNER_CAMPAIGN_ID
  where d.SOURCE = 'Vistar'
)
select
  'Programmatic - OOH'                    as CHANNEL,
  REPORT_DATE                             as DATE_DAY,
  max(PARTNER_CAMPAIGN_NAME)              as LINE_ITEM_NAME,
  resolved_line_item_id                   as LINE_ITEM_ID,
  max(PARTNER_CAMPAIGN_NAME)              as ENTITY_NAME,
  lower(trim(PARTNER_CAMPAIGN_ID))        as ENTITY_ID,
  max(PARTNER_CAMPAIGN_NAME)              as CAMPAIGN_NAME,
  sum(AMOUNT_SPENT)                       as AMOUNT_SPENT,      -- Vistar Revenue = client cost
  round(sum(IMPRESSIONS))                 as IMPRESSIONS,
  0                                       as CLICKS,
  sum(PLAYS)                              as RESULTS,           -- plays ride in RESULTS on this channel
  0                                       as VIDEO_3S_VIEWS,
  max(LOADED_AT)                          as MAX_FIVETRAN_SYNCED_AT
from rows
where resolved_line_item_id is not null
group by REPORT_DATE, resolved_line_item_id, lower(trim(PARTNER_CAMPAIGN_ID));
