-- ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace task TSK_ROOT_DAILY_REFRESH
	warehouse=AV_APP_WH
	schedule='USING CRON 30 6 * * * Australia/Melbourne'
	as select 1;
