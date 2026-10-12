-- ASSEMBLEDVIEW.MART.TSK_REFRESH_FIXED_COST_REPORTED
-- Body is SP_REFRESH_FIXED_COST_NIGHTLY (3-day window, partner-file / direct-digital backfill, then SP_REFRESH_ASSUMED_SPEND_DAILY('changed')).
-- Do not re-apply this task. The CALL is unchanged. Replacing a child task needs the root suspended.
-- Root must be suspended to replace a child. AUTHOR ONLY — Luke applies in Snowsight (S1, 2026-09-16).
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace task TSK_REFRESH_FIXED_COST_REPORTED
	warehouse=AV_APP_WH
	after ASSEMBLEDVIEW.MART.TSK_REFRESH_GOOGLESEARCHPACING, ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT, ASSEMBLEDVIEW.MART.TSK_REFRESH_SOCIAL_PACING_FACT
	as CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY();
