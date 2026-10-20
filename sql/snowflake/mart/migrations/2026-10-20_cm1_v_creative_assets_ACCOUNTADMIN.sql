-- CM1 (2026-10-20): V_CREATIVE_ASSETS with the CM360 branch.
-- Run this whole file in Snowsight as ACCOUNTADMIN. Read-only view; no table changes.
-- Same text as the V_CREATIVE_ASSETS block in
-- sql/snowflake/mart/views/creative_web_search_views.sql (that file stays the source).
--
-- Check after (expect cm360 image about 64, video about 37):
-- SELECT platform, preview_kind, COUNT(*) FROM ASSEMBLEDVIEW.MART.V_CREATIVE_ASSETS GROUP BY 1, 2 ORDER BY 1, 2;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_ASSETS COPY GRANTS AS
WITH latest_meta_ad AS (
  SELECT
    id,
    ad_set_id,
    creative_id,
    preview_shareable_link,
    updated_time,
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY updated_time DESC, _fivetran_synced DESC
    ) AS rn
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.AD_HISTORY
),
latest_meta_creative AS (
  SELECT
    id,
    thumbnail_url,
    image_url,
    video_id,
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY _fivetran_synced DESC
    ) AS rn
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.CREATIVE_HISTORY
),
latest_meta_ad_set AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY updated_time DESC, _fivetran_synced DESC
    ) AS rn
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.AD_SET_HISTORY
),
latest_tiktok_ad AS (
  SELECT
    ad_id,
    adgroup_id,
    adgroup_name,
    video_id,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY ad_id
      ORDER BY updated_at DESC, _fivetran_synced DESC
    ) AS rn
  FROM ASSEMBLEDVIEW.TIKTOK_ADS.AD_HISTORY
),
latest_tiktok_video AS (
  SELECT
    video_id,
    video_cover_url,
    ROW_NUMBER() OVER (
      PARTITION BY video_id
      ORDER BY updated_at DESC, _fivetran_synced DESC
    ) AS rn
  FROM ASSEMBLEDVIEW.TIKTOK_ADS.VIDEO_HISTORY
),
-- CM360 (2026-10-20). V_CREATIVE_PERFORMANCE_DAILY keys CM360 by
-- lower(trim(creative name)); one name can be several creatives (sizes), so
-- pick one image and one video per name.
-- Display image: https://s0.2mdn.net/<advertiser id>/<asset file name>
--   (checked live in a browser on 20 Oct for PGA, advertiser 15454331).
--   PRIMARY asset of a DISPLAY creative, or the BACKUP_IMAGE of an HTML5 one.
--   Prefer the largest size up to 300x600, then the smallest, then the newest.
-- Video: a progressive mp4 on gcdn.2mdn.net (public), stored as view_url and
--   played in the browser. Prefer 500 to 2,500 kbps, then the highest, then newest.
-- HTML5 creatives with no backup image, tracking creatives and 1x1s get no preview.
cm360_creative AS (
  SELECT
    c.id,
    c.advertiser_id,
    LOWER(TRIM(c.name)) AS creative_key,
    c.type,
    COALESCE(c.size_width, 0) * COALESCE(c.size_height, 0) AS area,
    c.last_modified_info_time AS modified_at
  FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CREATIVE c
  WHERE c.name IS NOT NULL AND TRIM(c.name) <> ''
),
cm360_image AS (
  SELECT
    c.creative_key,
    c.id::varchar AS creative_id,
    'https://s0.2mdn.net/' || c.advertiser_id || '/' || REPLACE(TRIM(a.asset_identifier_name), ' ', '%20') AS url,
    c.modified_at
  FROM cm360_creative c
  JOIN ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CREATIVE_ASSET a
    ON a.creative_id = c.id
  WHERE ((c.type = 'DISPLAY' AND a.role = 'PRIMARY') OR a.role = 'BACKUP_IMAGE')
    AND REGEXP_LIKE(LOWER(a.asset_identifier_name), '.*\\.(png|jpe?g|gif|webp)$')
    AND c.area > 1
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY c.creative_key
    ORDER BY IFF(c.area <= 300 * 600, c.area, 0) DESC, c.area ASC, c.modified_at DESC
  ) = 1
),
cm360_video AS (
  SELECT
    c.creative_key,
    c.id::varchar AS creative_id,
    a.progressive_serving_url AS url,
    c.modified_at
  FROM cm360_creative c
  JOIN ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CREATIVE_ASSET a
    ON a.creative_id = c.id
  WHERE c.type LIKE 'INSTREAM_VIDEO%'
    AND a.mime_type = 'video/mp4'
    AND a.progressive_serving_url LIKE 'https://gcdn.2mdn.net/%'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY c.creative_key
    ORDER BY IFF(a.bit_rate BETWEEN 500 AND 2500, 0, 1), a.bit_rate DESC, c.modified_at DESC
  ) = 1
),
cm360 AS (
  SELECT
    'cm360' AS platform,
    k.creative_key,
    NULL::varchar AS ad_set_id,
    NULL::varchar AS ad_set_name,
    COALESCE(i.creative_id, v.creative_id) AS creative_id,
    i.url AS preview_image_url,
    IFF(i.url IS NULL, 'video', 'image') AS preview_kind,
    IFF(i.url IS NULL, v.url, NULL) AS view_url,
    COALESCE(i.modified_at, v.modified_at)::timestamp_ntz AS updated_at
  FROM (SELECT creative_key FROM cm360_image UNION SELECT creative_key FROM cm360_video) k
  LEFT JOIN cm360_image i ON i.creative_key = k.creative_key
  LEFT JOIN cm360_video v ON v.creative_key = k.creative_key
),
active_creatives AS (
  SELECT DISTINCT platform, creative_key
  FROM ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY
  WHERE platform IN ('meta', 'tiktok', 'cm360')
    AND date >= DATEADD(day, -400, CURRENT_DATE())
),
meta AS (
  SELECT
    'meta' AS platform,
    a.id::varchar AS creative_key,
    TRIM(a.ad_set_id::varchar) AS ad_set_id,
    s.name AS ad_set_name,
    a.creative_id::varchar AS creative_id,
    COALESCE(NULLIF(TRIM(c.thumbnail_url), ''), NULLIF(TRIM(c.image_url), '')) AS preview_image_url,
    CASE WHEN c.video_id IS NOT NULL THEN 'video' ELSE 'image' END AS preview_kind,
    NULLIF(TRIM(a.preview_shareable_link), '') AS view_url,
    a.updated_time::timestamp_ntz AS updated_at
  FROM latest_meta_ad a
  LEFT JOIN latest_meta_creative c
    ON c.id::varchar = a.creative_id::varchar
   AND c.rn = 1
  LEFT JOIN latest_meta_ad_set s
    ON s.id::varchar = a.ad_set_id::varchar
   AND s.rn = 1
  WHERE a.rn = 1
),
tiktok AS (
  SELECT
    'tiktok' AS platform,
    h.ad_id::varchar AS creative_key,
    TRIM(h.adgroup_id::varchar) AS ad_set_id,
    h.adgroup_name AS ad_set_name,
    h.video_id::varchar AS creative_id,
    NULLIF(TRIM(v.video_cover_url), '') AS preview_image_url,
    'video' AS preview_kind,
    NULL::varchar AS view_url,
    h.updated_at::timestamp_ntz AS updated_at
  FROM latest_tiktok_ad h
  LEFT JOIN latest_tiktok_video v
    ON v.video_id::varchar = h.video_id::varchar
   AND v.rn = 1
  WHERE h.rn = 1
),
assets AS (
  SELECT * FROM meta
  UNION ALL
  SELECT * FROM tiktok
  UNION ALL
  SELECT * FROM cm360
)
SELECT
  x.platform,
  x.creative_key,
  x.ad_set_id,
  x.ad_set_name,
  x.creative_id,
  x.preview_image_url,
  x.preview_kind,
  x.view_url,
  CASE
    WHEN x.platform = 'meta' THEN TO_TIMESTAMP_NTZ(TRY_TO_NUMBER(
      UPPER(REGEXP_SUBSTR(x.preview_image_url, '[?&]oe=([0-9A-Fa-f]+)', 1, 1, 'e', 1)),
      'XXXXXXXXXXXXXXXX'
    ))
    ELSE NULL::timestamp_ntz
  END AS image_expires_at,
  x.updated_at
FROM assets x
JOIN active_creatives ac
  ON ac.platform = x.platform
 AND ac.creative_key = x.creative_key;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_ASSETS TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_ASSETS TO ROLE CLAUDE_RW;
