-- V_WEB_ACCOUNTS: GA4 properties and Search Console sites available in the
-- warehouse, for the Web & search builder's account picker (2026-10-20).
-- Run in Snowsight as ACCOUNTADMIN. Read-only; no table changes.
--
-- GA4: GOOGLE_ANALYTICS_4.PROPERTIES (NAME is 'properties/<id>', DISPLAY_NAME
--      is the name GA4 shows). Deleted properties are left out.
-- GSC: distinct SITE from GOOGLE_SEARCH_CONSOLE.SITE_REPORT_BY_SITE, with the
--      last day of data, so stale sites show as such in the picker.
--      The scan is limited to the last 400 days, the same window as V_GSC_SITE_DAILY.

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_WEB_ACCOUNTS COPY GRANTS AS
SELECT
  'ga4' AS platform,
  REGEXP_SUBSTR(name, '[0-9]+') AS account_ref,
  TRIM(display_name) AS label,
  NULL::date AS last_data_date
FROM ASSEMBLEDVIEW.GOOGLE_ANALYTICS_4.PROPERTIES
WHERE delete_time IS NULL
  AND REGEXP_SUBSTR(name, '[0-9]+') IS NOT NULL
UNION ALL
SELECT
  'gsc' AS platform,
  site AS account_ref,
  site AS label,
  MAX(date::date) AS last_data_date
FROM ASSEMBLEDVIEW.GOOGLE_SEARCH_CONSOLE.SITE_REPORT_BY_SITE
WHERE date::date >= DATEADD(day, -400, CURRENT_DATE())
GROUP BY site;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_WEB_ACCOUNTS TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_WEB_ACCOUNTS TO ROLE CLAUDE_RW;

-- check: expect 14 GA4 properties and 6 Search Console sites (20 Oct 2026)
-- SELECT platform, COUNT(*) AS n FROM ASSEMBLEDVIEW.MART.V_WEB_ACCOUNTS GROUP BY platform;
