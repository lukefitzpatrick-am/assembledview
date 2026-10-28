-- ASSEMBLEDVIEW.MART.CM360_MANUAL_ROWS
-- Created by SQ1 on 2026-10-28 (ACCOUNTADMIN). Not a GET_DDL capture: CLAUDE_RW
-- has no privilege on the table, so this is the SQ1 CREATE text. To check
-- against live, as ACCOUNTADMIN:
--   SELECT GET_DDL('table', 'ASSEMBLEDVIEW.MART.CM360_MANUAL_ROWS');
-- Hand-loaded partner delivery in the CM360 shape (partners that ran without
-- CM360 tags). VW_PACING_CM360 unions it in, so the nightly pacing task treats
-- these rows as CM360 source rows. SOURCE_NOTE tags each load (first load:
-- 'manual_quantcast_20261028', 448 rows, Sinch 12 to 27 Oct, seen through the
-- view on 2026-10-28). Placement names must not also exist in CM_360_PACING,
-- or the view double counts them.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE TABLE IF NOT EXISTS CM360_MANUAL_ROWS (
  DATE                DATE          NOT NULL,
  PLACEMENT           VARCHAR       NOT NULL,
  CAMPAIGN            VARCHAR,
  CREATIVE            VARCHAR,
  CREATIVE_PIXEL_SIZE VARCHAR,
  ADVERTISER          VARCHAR,
  IMPRESSIONS         NUMBER(38,0),
  CLICKS              NUMBER(38,0),
  VIDEO_COMPLETIONS   NUMBER(38,0),
  TOTAL_CONVERSIONS   FLOAT,
  SOURCE_NOTE         VARCHAR       NOT NULL,
  LOADED_AT           TIMESTAMP_TZ  DEFAULT CURRENT_TIMESTAMP()
);
