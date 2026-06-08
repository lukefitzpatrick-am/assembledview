-- ASSEMBLEDVIEW.MART.VW_PACING_GOOGLE_SEARCH_DAILY
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_PACING_GOOGLE_SEARCH_DAILY(
	CHANNEL,
	DATE_DAY,
	CUSTOMER_ID,
	CAMPAIGN_NAME,
	LINE_ITEM_NAME,
	LINE_ITEM_ID,
	PLATFORM_LINE_ITEM_ID,
	CAMPAIGN_ID,
	AMOUNT_SPENT,
	IMPRESSIONS,
	CLICKS,
	CONVERSIONS,
	REVENUE,
	TOP_IMPRESSION_PERCENTAGE,
	ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
	MAX_FIVETRAN_SYNCED_AT,
	UPDATED_AT
) as

with

-- ─── SEARCH BRANCH ───────────────────────────────────────────────────────────

keyword_rollup as (
    select
        cast(s.DATE as date)                            as DATE_DAY,
        s.CAMPAIGN_ID::string                           as CAMPAIGN_ID,
        s.AD_GROUP_ID::string                           as AD_GROUP_ID,
        s.CUSTOMER_ID::string                           as CUSTOMER_ID,
        sum(coalesce(s.COST_MICROS, 0)) / 1000000.0    as AMOUNT_SPENT,
        sum(coalesce(s.IMPRESSIONS, 0))                 as IMPRESSIONS,
        sum(coalesce(s.CLICKS, 0))                      as CLICKS,
        avg(s.TOP_IMPRESSION_PERCENTAGE)                as TOP_IMPRESSION_PERCENTAGE,
        avg(s.ABSOLUTE_TOP_IMPRESSION_PERCENTAGE)       as ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
        max(s._FIVETRAN_SYNCED)::timestamp_ntz          as MAX_FIVETRAN_SYNCED_AT
    from ASSEMBLEDVIEW.GOOGLE_ADS.SEARCH_KEYWORD_STATS s
    group by 1, 2, 3, 4
),

adgroup_conv_rollup as (
    select
        cast(a.DATE as date)                            as DATE_DAY,
        a.CAMPAIGN_ID::string                           as CAMPAIGN_ID,
        a.ID::string                                    as AD_GROUP_ID,
        sum(coalesce(a.CONVERSIONS, 0))                 as CONVERSIONS,
        sum(coalesce(a.CONVERSIONS_VALUE, 0))           as REVENUE
    from ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_STATS a
    group by 1, 2, 3
),

combined as (
    select
        k.DATE_DAY,
        k.CAMPAIGN_ID,
        k.AD_GROUP_ID,
        k.CUSTOMER_ID,
        k.AMOUNT_SPENT,
        k.IMPRESSIONS,
        k.CLICKS,
        coalesce(c.CONVERSIONS, 0)                      as CONVERSIONS,
        coalesce(c.REVENUE, 0)                          as REVENUE,
        k.TOP_IMPRESSION_PERCENTAGE,
        k.ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
        k.MAX_FIVETRAN_SYNCED_AT
    from keyword_rollup k
    left join adgroup_conv_rollup c
        on  c.DATE_DAY    = k.DATE_DAY
        and c.CAMPAIGN_ID = k.CAMPAIGN_ID
        and c.AD_GROUP_ID = k.AD_GROUP_ID
),

named as (
    select
        'Search - Google Ads'                                               as CHANNEL,
        c.DATE_DAY,
        c.CUSTOMER_ID,
        g.CAMPAIGN_NAME,
        g.AD_GROUP_NAME                                                     as LINE_ITEM_NAME,
        lower(trim(regexp_substr(g.AD_GROUP_NAME, '[^-]+$')))               as LINE_ITEM_ID,
        c.AD_GROUP_ID                                                       as PLATFORM_LINE_ITEM_ID,
        c.CAMPAIGN_ID,
        c.AMOUNT_SPENT,
        c.IMPRESSIONS,
        c.CLICKS,
        c.CONVERSIONS,
        c.REVENUE,
        c.TOP_IMPRESSION_PERCENTAGE,
        c.ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
        c.MAX_FIVETRAN_SYNCED_AT,
        current_timestamp()                                                 as UPDATED_AT
    from combined c
    left join ASSEMBLEDVIEW.MART.VW_GOOGLE_AD_GROUP_LATEST g
        on g.AD_GROUP_ID = c.AD_GROUP_ID
),

-- ─── SHOPPING BRANCH ─────────────────────────────────────────────────────────

-- Get the current active name record for each Shopping ad group
shopping_adgroup_latest as (
    select
        ID::string                                      as AD_GROUP_ID,
        NAME                                            as AD_GROUP_NAME,
        CAMPAIGN_ID::string                             as CAMPAIGN_ID,
        CAMPAIGN_NAME
    from ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_HISTORY
    where TYPE = 'SHOPPING_PRODUCT_ADS'
      and _FIVETRAN_ACTIVE = true
),

-- Get the set of Shopping campaign IDs to filter AD_GROUP_STATS
shopping_campaign_ids as (
    select distinct CAMPAIGN_ID
    from shopping_adgroup_latest
),

-- Roll up AD_GROUP_STATS for Shopping ad groups only
shopping_stats as (
    select
        cast(a.DATE as date)                            as DATE_DAY,
        a.CAMPAIGN_ID::string                           as CAMPAIGN_ID,
        a.ID::string                                    as AD_GROUP_ID,
        a.CUSTOMER_ID::string                           as CUSTOMER_ID,
        sum(coalesce(a.COST_MICROS, 0)) / 1000000.0    as AMOUNT_SPENT,
        sum(coalesce(a.IMPRESSIONS, 0))                 as IMPRESSIONS,
        sum(coalesce(a.CLICKS, 0))                      as CLICKS,
        sum(coalesce(a.CONVERSIONS, 0))                 as CONVERSIONS,
        sum(coalesce(a.CONVERSIONS_VALUE, 0))           as REVENUE,
        max(a._FIVETRAN_SYNCED)::timestamp_ntz          as MAX_FIVETRAN_SYNCED_AT
    from ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_STATS a
    where a.CAMPAIGN_ID::string in (select CAMPAIGN_ID from shopping_campaign_ids)
    group by 1, 2, 3, 4
),

shopping as (
    select
        'Shopping - Google Ads'                                             as CHANNEL,
        s.DATE_DAY,
        s.CUSTOMER_ID,
        g.CAMPAIGN_NAME,
        g.AD_GROUP_NAME                                                     as LINE_ITEM_NAME,
        lower(trim(regexp_substr(g.AD_GROUP_NAME, '[^-]+$')))               as LINE_ITEM_ID,
        s.AD_GROUP_ID                                                       as PLATFORM_LINE_ITEM_ID,
        s.CAMPAIGN_ID,
        s.AMOUNT_SPENT,
        s.IMPRESSIONS,
        s.CLICKS,
        s.CONVERSIONS,
        s.REVENUE,
        NULL::float                                                         as TOP_IMPRESSION_PERCENTAGE,
        NULL::float                                                         as ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
        s.MAX_FIVETRAN_SYNCED_AT,
        current_timestamp()                                                 as UPDATED_AT
    from shopping_stats s
    left join shopping_adgroup_latest g
        on g.AD_GROUP_ID = s.AD_GROUP_ID
),

-- ─── PMAX BRANCH ─────────────────────────────────────────────────────────────

pmax as (
    select
        'PMax - Google Ads'                                                 as CHANNEL,
        cast(DATE as date)                                                  as DATE_DAY,
        CUSTOMER_ID::string                                                 as CUSTOMER_ID,
        CAMPAIGN_NAME,
        NAME                                                                as LINE_ITEM_NAME,
        lower(trim(regexp_substr(NAME, '[^-]+$')))                          as LINE_ITEM_ID,
        ID::string                                                          as PLATFORM_LINE_ITEM_ID,
        CAMPAIGN_ID::string                                                 as CAMPAIGN_ID,
        sum(coalesce(COST_MICROS, 0)) / 1000000.0                          as AMOUNT_SPENT,
        sum(coalesce(IMPRESSIONS, 0))                                       as IMPRESSIONS,
        sum(coalesce(CLICKS, 0))                                            as CLICKS,
        sum(coalesce(CONVERSIONS, 0))                                       as CONVERSIONS,
        sum(coalesce(CONVERSIONS_VALUE, 0))                                 as REVENUE,
        NULL::float                                                         as TOP_IMPRESSION_PERCENTAGE,
        NULL::float                                                         as ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
        max(_FIVETRAN_SYNCED)::timestamp_ntz                                as MAX_FIVETRAN_SYNCED_AT,
        current_timestamp()                                                 as UPDATED_AT
    from ASSEMBLEDVIEW.GOOGLE_ADS.ASSET_GROUP
    group by
        cast(DATE as date),
        CUSTOMER_ID::string,
        CAMPAIGN_NAME,
        NAME,
        ID::string,
        CAMPAIGN_ID::string
)

-- ─── FINAL OUTPUT ─────────────────────────────────────────────────────────────

select * from named

union all

select * from shopping

union all

select * from pmax;
