-- ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING
-- Captured 2026-06-08 BEFORE Pattern A retirement. Not previously version-controlled.
-- This object is slated for removal once the six pacingMart-dependent endpoints are migrated.
-- Captured here only so the definition is not lost.
USE SCHEMA ASSEMBLEDVIEW.VW_PACING;

create or replace view V_LINE_ITEM_PACING(
	CLIENTS_ID,
	AV_LINE_ITEM_ID,
	MEDIA_PLAN_ID,
	AV_LINE_ITEM_LABEL,
	MEDIA_TYPE,
	START_DATE,
	END_DATE,
	AS_OF_DATE,
	CAMPAIGN_DAYS,
	DAYS_PASSED,
	DAYS_REMAINING,
	LINE_ITEM_BUDGET,
	SPEND_TO_DATE,
	SPEND_YESTERDAY,
	EXPECTED_SPEND,
	EXPECTED_PCT,
	SPEND_VARIANCE,
	SPEND_VARIANCE_PCT,
	DAILY_PACE,
	REQUIRED_DAILY,
	PROJECTED_TOTAL,
	PROJECTION_VARIANCE_PCT,
	IMPRESSIONS_TO_DATE,
	CLICKS_TO_DATE,
	CONVERSIONS_TO_DATE,
	REVENUE_TO_DATE,
	CTR,
	CPC,
	CPA,
	CR,
	ROAS,
	STATUS
) as
WITH today AS (
  SELECT CONVERT_TIMEZONE('UTC','Australia/Melbourne', CURRENT_TIMESTAMP())::DATE AS today_date
),
li AS (
  SELECT
    clients_id,
    av_line_item_id,
    ANY_VALUE(media_plan_id)        AS media_plan_id,
    ANY_VALUE(av_line_item_label)   AS av_line_item_label,
    ANY_VALUE(media_type)           AS media_type,
    ANY_VALUE(line_item_budget)     AS line_item_budget,
    ANY_VALUE(line_item_start_date) AS start_date,
    ANY_VALUE(line_item_end_date)   AS end_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN spend       ELSE 0 END) AS spend_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN impressions ELSE 0 END) AS impressions_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN clicks      ELSE 0 END) AS clicks_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN conversions ELSE 0 END) AS conversions_to_date,
    SUM(CASE WHEN date <= (SELECT today_date FROM today) THEN revenue     ELSE 0 END) AS revenue_to_date,
    SUM(CASE WHEN date  = (SELECT today_date FROM today) - 1 THEN spend   ELSE 0 END) AS spend_yesterday
  FROM ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY
  GROUP BY clients_id, av_line_item_id
),
maths AS (
  SELECT
    li.*,
    (SELECT today_date FROM today)                                              AS as_of_date,
    DATEDIFF('day', li.start_date, li.end_date) + 1                             AS campaign_days,
    GREATEST(0, LEAST(
      DATEDIFF('day', li.start_date, li.end_date) + 1,
      DATEDIFF('day', li.start_date, (SELECT today_date FROM today)) + 1
    ))                                                                          AS days_passed,
    GREATEST(0,
      DATEDIFF('day', li.start_date, li.end_date) + 1
      - GREATEST(0, LEAST(
          DATEDIFF('day', li.start_date, li.end_date) + 1,
          DATEDIFF('day', li.start_date, (SELECT today_date FROM today)) + 1
        ))
    )                                                                           AS days_remaining
  FROM li
),
pacing AS (
  SELECT
    m.*,
    DIV0(m.days_passed::FLOAT, m.campaign_days)                                 AS expected_pct,
    m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)            AS expected_spend,
    m.spend_to_date - (m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)) AS spend_variance,
    DIV0(
      m.spend_to_date - (m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)),
      m.line_item_budget * DIV0(m.days_passed::FLOAT, m.campaign_days)
    )                                                                           AS spend_variance_pct,
    DIV0(m.spend_to_date, m.days_passed)                                        AS daily_pace,
    DIV0(m.line_item_budget - m.spend_to_date, m.days_remaining)                AS required_daily,
    DIV0(m.spend_to_date, m.days_passed) * m.campaign_days                      AS projected_total,
    DIV0(
      (DIV0(m.spend_to_date, m.days_passed) * m.campaign_days) - m.line_item_budget,
      m.line_item_budget
    )                                                                           AS projection_variance_pct
  FROM maths m
)
SELECT
  p.clients_id,
  p.av_line_item_id,
  p.media_plan_id,
  p.av_line_item_label,
  p.media_type,
  p.start_date,
  p.end_date,
  p.as_of_date,
  p.campaign_days,
  p.days_passed,
  p.days_remaining,
  p.line_item_budget,
  p.spend_to_date,
  p.spend_yesterday,
  p.expected_spend,
  p.expected_pct,
  p.spend_variance,
  p.spend_variance_pct,
  p.daily_pace,
  p.required_daily,
  p.projected_total,
  p.projection_variance_pct,
  p.impressions_to_date,
  p.clicks_to_date,
  p.conversions_to_date,
  p.revenue_to_date,
  DIV0(p.clicks_to_date, p.impressions_to_date)        AS ctr,
  DIV0(p.spend_to_date,  p.clicks_to_date)             AS cpc,
  DIV0(p.spend_to_date,  p.conversions_to_date)        AS cpa,
  DIV0(p.conversions_to_date, p.clicks_to_date)        AS cr,
  DIV0(p.revenue_to_date, p.spend_to_date)             AS roas,
  -- Single source of truth for status. Order matters.
  CASE
    WHEN p.as_of_date < p.start_date                                                          THEN 'not_started'
    WHEN p.as_of_date > p.end_date                                                            THEN 'completed'
    WHEN p.spend_to_date = 0 AND p.days_passed >= 2                                           THEN 'no_delivery'
    WHEN ABS(p.projection_variance_pct) <= 0.05                                               THEN 'on_track'
    WHEN p.projection_variance_pct > -0.15 AND p.projection_variance_pct < -0.05              THEN 'slightly_under'
    WHEN p.projection_variance_pct <= -0.15                                                   THEN 'under_pacing'
    WHEN p.projection_variance_pct > 0.05  AND p.projection_variance_pct < 0.15               THEN 'slightly_over'
    WHEN p.projection_variance_pct >= 0.15                                                    THEN 'over_pacing'
    ELSE 'unknown'
  END                                                                                        AS status
FROM pacing p;
