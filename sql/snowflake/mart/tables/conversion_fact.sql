-- ASSEMBLEDVIEW.MART.CONVERSION_FACT
-- Run by Luke 2026-10-21 (plan PLAN-AV-conversions-roas section 8.1). Matches GET_DDL.
-- Long format: one row per channel, day, platform line id, platform and event.
-- PLATFORM_LINE_ITEM_ID uses the same key as the pacing facts, so line ids
-- and relabels come from the pacing facts at read time (VW_CONVERSION_DAILY).
-- Loaded by TSK_REFRESH_CONVERSION_FACT (14-day rolling MERGE). Backfilled from 2026-01-01.
USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.CONVERSION_FACT (
  CHANNEL                 VARCHAR      NOT NULL,
  DATE_DAY                DATE         NOT NULL,
  PLATFORM_LINE_ITEM_ID   VARCHAR      NOT NULL,
  PLATFORM                VARCHAR      NOT NULL,
  EVENT_KEY               VARCHAR      NOT NULL,
  EVENT_NAME              VARCHAR,
  EVENT_CATEGORY          VARCHAR,
  CONVERSIONS             FLOAT,
  CONVERSION_VALUE        FLOAT,
  MAX_FIVETRAN_SYNCED_AT  TIMESTAMP_NTZ,
  UPDATED_AT              TIMESTAMP_NTZ
);
GRANT SELECT ON TABLE ASSEMBLEDVIEW.MART.CONVERSION_FACT TO ROLE CLAUDE_RW;
