-- CF1 reconciliation checks for CONVERSION_FACT (plan section 8.5 plus raw source checks).
-- Read only. Any role with SELECT (CLAUDE_RW). Run after the backfill and after each task run.
-- Results on 2026-10-21 (Luke): Meta purchases match raw exactly. Google differs from
-- SEARCH_PACING_FACT on 477 days: Krusty Krab test rows (removed by DG1) and conversions
-- restating after the 14-day window. CONVERSION_FACT is the better Google source.

-- 1. Meta purchases: fact against raw, 2026. Expect zero rows.
SELECT f.date_day, f.n AS fact_n, r.n AS raw_n
FROM (SELECT date_day, SUM(conversions) n FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT WHERE platform='meta_ads' AND event_key='purchase' AND date_day>='2026-01-01' GROUP BY 1) f
FULL JOIN (SELECT DATE::DATE date_day, SUM(VALUE) n FROM ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD_SET_ACTIONS WHERE ACTION_TYPE='purchase' AND DATE>='2026-01-01' GROUP BY 1) r USING (date_day)
WHERE ABS(COALESCE(f.n,0) - COALESCE(r.n,0)) > 0.001;

-- 2. Meta purchase value: fact against raw ad values, 2026. The gap is ads missing from
--    AD_HISTORY plus values on ad set days with no purchase count (accepted, about $47k).
SELECT (SELECT ROUND(SUM(conversion_value)) FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT
         WHERE platform='meta_ads' AND event_key='purchase' AND date_day>='2026-01-01') AS fact_value,
       (SELECT ROUND(SUM(VALUE)) FROM ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD_ACTION_VALUES
         WHERE LOWER(ACTION_TYPE)='purchase' AND DATE>='2026-01-01') AS raw_value;

-- 3. Google totals: fact against SEARCH_PACING_FACT. Differences expected (see header).
SELECT f.channel, f.date_day, f.n AS fact_n, s.n AS search_fact_n
FROM (SELECT channel, date_day, SUM(conversions) n FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT WHERE platform='google_ads' AND event_key='all_primary' GROUP BY 1, 2) f
JOIN (SELECT channel, date_day, SUM(conversions) n FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT GROUP BY 1, 2) s USING (channel, date_day)
WHERE ABS(f.n - s.n) > 0.01;

-- 4. DV360 never carries value (REVENUE_ADV_CURRENCY is media revenue). Expect zero rows.
SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT
WHERE platform='dv360' AND COALESCE(conversion_value,0) <> 0 HAVING COUNT(*) > 0;

-- 5. No Meta duplicate purchase keys loaded. Expect zero rows.
SELECT event_key, COUNT(*) FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT
WHERE platform='meta_ads' AND event_key IN ('omni_purchase','onsite_web_purchase','offsite_conversion.fb_pixel_purchase','web_in_store_purchase')
GROUP BY 1;

-- 6. Rows with no line id after the join. Not expected to be zero; sizes the gap.
SELECT platform, COUNT(*) rows_no_line, ROUND(SUM(conversion_value)) value_no_line
FROM ASSEMBLEDVIEW.MART.VW_CONVERSION_DAILY WHERE line_item_id IS NULL AND date_day >= '2026-01-01'
GROUP BY 1;

-- 7. Freshness: last load per platform.
SELECT platform, MAX(date_day) last_day, MAX(updated_at) last_merge
FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT GROUP BY 1 ORDER BY 1;
