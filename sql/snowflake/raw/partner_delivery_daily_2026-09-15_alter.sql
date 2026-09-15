-- ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY
-- Applied 2026-09-15 (ACCOUNTADMIN). Capture only; this file is not applied by the commit.
-- Seven columns for Vistar exchange reports (amount, plays, venue, metro, state, campaign/creative ids).
USE SCHEMA ASSEMBLEDVIEW.RAW;

alter table ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY add column if not exists
  AMOUNT_SPENT        NUMBER(18,4),
  PLAYS               NUMBER(38,0),
  VENUE_TYPE          VARCHAR,
  METRO_AREA          VARCHAR,
  STATE               VARCHAR,
  PARTNER_CAMPAIGN_ID VARCHAR,
  PARTNER_CREATIVE_ID VARCHAR;
