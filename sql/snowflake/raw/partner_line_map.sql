-- ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
-- Applied 2026-09-15 (ACCOUNTADMIN). Capture only; this file is not applied by the commit.
-- 48-row seed from the 15 Sep Vistar exchange file. Legal Super -> legal004po1.
-- Sinch AV_LINE_ITEM_ID is NULL until Luke splits PO1/PO2/PO3 by market (NOTES holds IO | metro).
-- The seed is NOT idempotent and Snowflake does not enforce the primary key: replaying it duplicates
-- rows and multiplies every figure in VW_PACING_PARTNER_OOH. Check the count before re-running.
USE SCHEMA ASSEMBLEDVIEW.RAW;

create table if not exists ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP (
  SOURCE_SLUG           VARCHAR(64)  NOT NULL,
  PARTNER_CAMPAIGN_ID   VARCHAR      NOT NULL,
  PARTNER_CAMPAIGN_NAME VARCHAR,
  AV_LINE_ITEM_ID       VARCHAR,          -- lowercase {mba}po{n}; NULL = unmapped, excluded from MART
  IS_ACTIVE             BOOLEAN      DEFAULT TRUE,
  NOTES                 VARCHAR,
  UPDATED_AT            TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  primary key (SOURCE_SLUG, PARTNER_CAMPAIGN_ID)
);

insert into ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
  (SOURCE_SLUG, PARTNER_CAMPAIGN_ID, PARTNER_CAMPAIGN_NAME, AV_LINE_ITEM_ID, IS_ACTIVE, NOTES)
values
  ('vistar', '2mwuisG2RiWjOG75ImX4Ug', 'Sinch - Campaign Launch Adelaide - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Adelaide'),
  ('vistar', '39bLfcP5Q9q9NcT0IGbYxg', 'legalsuper - Jan-Mar26 New South Wales - Transit|Train Stations - VIOOH AUS', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', '4hrv1r7xQriZBxj3XZ4NIg', 'legalsuper - Jan-Mar26 Victoria - Outdoor|Urban Panels - VIOOH AUS', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne'),
  ('vistar', '5Z1FNLvUTH0GGCLmgSWFTA', 'Sinch - Campaign Launch Sydney - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Sydney'),
  ('vistar', '71Hc8ROfR_6sUvUlxj_itQ', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Outdoor|Bus Shelters - oOh! Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', '7a3PpWQARm0LDir1oGsOOw', 'legalsuper - Jan-Mar26 New South Wales - Outdoor|Urban Panels - Jolt AU', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', '7n0OfQB8SkqfM0Oo7KPYgA', 'Sinch - Campaign Launch Monash - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Melbourne'),
  ('vistar', '828DjPrOTh0MkYvB8lc4KQ', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Transit|Train Stations - oOh! Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', '8i1dVJXmSyiiDAw0oVncpQ', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Transit|Train Stations - TorchMedia', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'A6cK0qf_RruGU2xFst0EHw', 'Sinch - Campaign Launch Brisbane - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Brisbane'),
  ('vistar', 'AZUZhoS1QYOlnzN1Akv_2Q', 'legalsuper - Jan-Mar26 New South Wales - Offices|Office Buildings - oOh! Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', 'C90KpWvVQ66CWryXjq0sqw', 'sinch PMP', NULL, TRUE, 'Sinch - Campaign Launch | Greater Melbourne'),
  ('vistar', 'D7qSIZs_QyuV1CsJWkMpYw', 'Sinch - Campaign Launch Melbourne - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Melbourne'),
  ('vistar', 'DNHhfxLoQl0m3Rm_wn600Q', 'Sinch - Campaign Launch Perth - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Perth'),
  ('vistar', 'Df5DRDLBRpeQoVLUK_LOxg', 'legalsuper - Jan-Mar26 New South Wales - Transit|Train Stations - TorchMedia', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', 'FBgTP4jLR8GpGISdiq91qw', 'Sinch - Campaign Launch Willoughby - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Sydney'),
  ('vistar', 'GF3WCIqbRE6Csn44ua2M6g', 'legalsuper - Jan-Mar26 Victoria - Offices|Office Buildings - Work Place Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne'),
  ('vistar', 'HAY_gOAzQ2C2TxF2LAq_CQ', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Offices|Office Buildings - Val Morgan', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', 'IHo3xcddQ0urFPtmXWVa6w', 'Sinch - Campaign Launch Parramatta - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Sydney'),
  ('vistar', 'KpQiYyfySaCzeDxLVlxMXg', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Outdoor|Urban Panels - VIOOH AUS', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', 'M7l06dA9T32EXGVj5sL19A', 'legalsuper - Jan-Mar26 New South Wales - Outdoor|Urban Panels - VIOOH AUS', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', 'MdNxlBScRbOo0jUmwJ7FZg', 'legalsuper - Jan-Mar26 New South Wales - Outdoor|Urban Panels - QMS', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', 'PNTkJ_FHQ9OfPRBjq0G6FQ', 'Sinch - Campaign Launch Melbourne - Offices|Office Buildings - Launch Scavenger Hunt', NULL, TRUE, 'Sinch - Campaign Launch | Greater Melbourne'),
  ('vistar', 'S0ovqqKXQGqjuBLvCrCiYg', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Outdoor|Urban Panels - Jolt AU', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', 'S4qlMgF7Soy6M0gzUbOjag', 'legalsuper - Jan-Mar26 Victoria - Outdoor|Bus Shelters - oOh! Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne'),
  ('vistar', 'SRnP6qngToiKK00ZEGokFA', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Offices|Office Buildings - oOh! Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'T1mUty7_QjaNwoMvguf4kA', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Offices|Office Buildings - Motio', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', 'U_Qz7IorQYyJzrrgbW00pA', 'Sinch - Campaign Launch North Sydney - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Sydney'),
  ('vistar', 'VvysC0_QRlegYo3vrNpJfA', 'legalsuper - Jan-Mar26 New South Wales - Offices|Office Buildings - Work Place Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', 'XNAbkgzgSjK71hVJ3SqG0w', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Outdoor|Urban Panels - VIOOH AUS', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'XYMw1JYXTdOpBChollKwWg', 'Sinch - Campaign Launch Port Phillip - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Melbourne'),
  ('vistar', 'Xif0cG8_QJaKx1b3XGPX1w', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Offices|Office Buildings - Val Morgan', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'YL1KBw99QoSA6fV7nYQBkQ', 'legalsuper - Jan-Mar26 New South Wales - Offices|Office Buildings - Val Morgan', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', '_1B0kLwHSH0dZ1DWcXpw7A', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Offices|Office Buildings - Work Place Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'c5OB2EZ3Tyaqx2i211bFMQ', 'legalsuper - Jan-Mar26 Victoria - Offices|Office Buildings - oOh! Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne'),
  ('vistar', 'cvkUZYKLTG6Jr7EytCiqiw', 'Sinch - Campaign Launch Northern Beaches - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Sydney'),
  ('vistar', 'foCrQDQhQVG6OkuSsRCnMA', 'Sinch - Campaign Launch Ryde - Offices|Office Buildings', NULL, TRUE, 'Sinch - Campaign Launch | Greater Sydney'),
  ('vistar', 'gUlEEG_oSrSzpkqdCisl8Q', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Offices|Office Buildings - Work Place Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', 'jPe_1SxLQ_KymcixBDBW5A', 'legalsuper - FY26 Q4 Apr-Jun Victoria - Offices|Office Buildings - oOh! Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Melbourne'),
  ('vistar', 'mxXQVNq8SHuX9WlEmaV60g', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Offices|Office Buildings - Motio', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'nWTf1BAwTcGHuSD1AzGRIw', 'legalsuper - Jan-Mar26 Victoria - Offices|Office Buildings - Val Morgan', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne'),
  ('vistar', 'qHr5EACLQbu4WPaDa9XUiA', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Outdoor|Urban Panels - QMS', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'r37pRPkVQKyxZyZgXqhKQg', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Outdoor|Urban Panels - Jolt AU', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'rOK6FXzjRrK9JXXwIa9flw', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Transit|Train Stations - VIOOH AUS', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'rpXJ2R1GQWmTqkaEytakpw', 'legalsuper - Jan-Mar26 Victoria - Outdoor|Urban Panels - Jolt AU', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne'),
  ('vistar', 'wIPSDEs_SW2sns7Q0vxEkw', 'legalsuper - FY26 Q4 Apr-Jun New South Wales - Outdoor|Bus Shelters - oOh! Media', 'legal004po1', TRUE, 'legalsuper - FY26 Q4 Apr-Jun | Greater Sydney'),
  ('vistar', 'wYCIHm0ST4uj9FNUDNfETQ', 'legalsuper - Jan-Mar26 New South Wales - Outdoor|Bus Shelters - oOh! Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Sydney'),
  ('vistar', 'z7EAXSsVSLCV40GCCIa0PA', 'legalsuper - Jan-Mar26 Victoria - Transit|Train Stations - oOh! Media', 'legal004po1', TRUE, 'legalsuper - Jan-Mar26 | Greater Melbourne');

grant select on table ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP to role CLAUDE_RW;
-- AV_APP_WRITE_ROLE reads the map so the app-role session can verify its state directly:
grant select on table ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP to role AV_APP_WRITE_ROLE;

-- Duplicate check. Expect 48, 48; anything higher means the seed was replayed.
select count(*) as MAP_ROWS, count(distinct PARTNER_CAMPAIGN_ID) as DISTINCT_CAMPAIGNS
from ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP where SOURCE_SLUG = 'vistar';

-- Dedupe if it was (ACCOUNTADMIN):
-- create or replace temporary table _map_dedupe as
-- select * from ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
-- qualify row_number() over (
--   partition by SOURCE_SLUG, PARTNER_CAMPAIGN_ID order by UPDATED_AT desc) = 1;
-- begin;
-- delete from ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP;
-- insert into ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP select * from _map_dedupe;
-- commit;
