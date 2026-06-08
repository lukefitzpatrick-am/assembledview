-- ASSEMBLEDVIEW.MART.VW_GOOGLE_AD_GROUP_LATEST
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_GOOGLE_AD_GROUP_LATEST(
	AD_GROUP_ID,
	CAMPAIGN_ID,
	CAMPAIGN_NAME,
	AD_GROUP_NAME,
	UPDATED_AT
) as
with ranked as (
  select
    ID::string as AD_GROUP_ID,
    CAMPAIGN_ID::string as CAMPAIGN_ID,
    CAMPAIGN_NAME::string as CAMPAIGN_NAME,
    NAME::string as AD_GROUP_NAME,
    UPDATED_AT::timestamp_ntz as UPDATED_AT,
    _FIVETRAN_ACTIVE::boolean as IS_ACTIVE,
    row_number() over (
      partition by ID
      order by UPDATED_AT desc
    ) as RN
  from ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_HISTORY
  where _FIVETRAN_ACTIVE = true
)
select
  AD_GROUP_ID,
  CAMPAIGN_ID,
  CAMPAIGN_NAME,
  AD_GROUP_NAME,
  UPDATED_AT
from ranked
where RN = 1;
