-- =============================================================================
-- AVA_READONLY: the role Ava's query_data tool runs as (switch ava_data_query).
-- Run as ACCOUNTADMIN (or SECURITYADMIN plus the MART owner) in Snowsight,
-- top to bottom, after filling in the two SET lines. Not run.
-- =============================================================================
-- What it does
--   Creates role AVA_READONLY with USAGE on the app warehouse, USAGE on
--   ASSEMBLEDVIEW and MART, and SELECT on every MART table and view, now and
--   future. Nothing else: no RAW, no write, no task, no procedure.
--   Grants the role to the app's Snowflake user (SNOWFLAKE_USERNAME in Vercel)
--   so query_data can open its own connection as AVA_READONLY. The app's other
--   queries keep SNOWFLAKE_ROLE. query_data runs USE SECONDARY ROLES NONE, so
--   the user's other roles never apply to Ava's session.
--
-- Fill in
SET app_user = '<SNOWFLAKE_USERNAME value from Vercel>';
SET app_wh   = '<SNOWFLAKE_WAREHOUSE value from Vercel>';

-- Before: expect no AVA_READONLY role yet, and the user and warehouse to exist.
SHOW ROLES LIKE 'AVA_READONLY';
SHOW USERS LIKE $app_user;
SHOW WAREHOUSES LIKE $app_wh;

CREATE ROLE IF NOT EXISTS AVA_READONLY COMMENT = 'Ava query_data: SELECT on ASSEMBLEDVIEW.MART only';
GRANT USAGE ON WAREHOUSE IDENTIFIER($app_wh) TO ROLE AVA_READONLY;
GRANT USAGE ON DATABASE ASSEMBLEDVIEW TO ROLE AVA_READONLY;
GRANT USAGE ON SCHEMA ASSEMBLEDVIEW.MART TO ROLE AVA_READONLY;
GRANT SELECT ON ALL TABLES IN SCHEMA ASSEMBLEDVIEW.MART TO ROLE AVA_READONLY;
GRANT SELECT ON ALL VIEWS IN SCHEMA ASSEMBLEDVIEW.MART TO ROLE AVA_READONLY;
GRANT SELECT ON FUTURE TABLES IN SCHEMA ASSEMBLEDVIEW.MART TO ROLE AVA_READONLY;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA ASSEMBLEDVIEW.MART TO ROLE AVA_READONLY;
GRANT ROLE AVA_READONLY TO USER IDENTIFIER($app_user);

-- After: expect only USAGE (warehouse, database, MART) and SELECT rows, and one
-- grant of the role to the app user. No INSERT, UPDATE, DELETE, OWNERSHIP or
-- CREATE anywhere.
SHOW GRANTS TO ROLE AVA_READONLY;
SHOW GRANTS OF ROLE AVA_READONLY;

-- Undo (if needed): DROP ROLE AVA_READONLY;
