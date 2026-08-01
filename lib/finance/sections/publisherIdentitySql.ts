/**
 * SQL expression for line-item publisher identity — mirrors
 * `resolveLineDimensions` / schedule header1 accessor order per channel.
 * Returns NULL when no identity field is populated.
 */
export const PUBLISHER_IDENTITY_SQL = `
NULLIF(BTRIM(
  CASE li.channel::text
    WHEN 'television' THEN COALESCE(li.attrs->>'network', '')
    WHEN 'radio' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.attrs->>'network', '')), ''),
      li.attrs->>'station',
      ''
    )
    WHEN 'newspaper' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      li.attrs->>'network',
      ''
    )
    WHEN 'magazines' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      li.attrs->>'network',
      ''
    )
    WHEN 'ooh' THEN COALESCE(li.attrs->>'network', '')
    WHEN 'cinema' THEN COALESCE(li.attrs->>'network', '')
    WHEN 'digi_display' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'digi_video' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'digi_audio' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      ''
    )
    WHEN 'digi_bvod' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      ''
    )
    WHEN 'search' THEN COALESCE(NULLIF(BTRIM(COALESCE(li.platform, '')), ''), '')
    WHEN 'social' THEN COALESCE(NULLIF(BTRIM(COALESCE(li.platform, '')), ''), '')
    WHEN 'prog_display' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'prog_video' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'prog_bvod' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'prog_audio' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'prog_ooh' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      li.attrs->>'site',
      ''
    )
    WHEN 'integrations' THEN COALESCE(NULLIF(BTRIM(COALESCE(li.platform, '')), ''), '')
    WHEN 'influencers' THEN COALESCE(NULLIF(BTRIM(COALESCE(li.platform, '')), ''), '')
    WHEN 'production' THEN COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      li.attrs->>'network',
      ''
    )
    ELSE COALESCE(
      NULLIF(BTRIM(COALESCE(li.publisher, '')), ''),
      NULLIF(BTRIM(COALESCE(li.platform, '')), ''),
      ''
    )
  END
), '')
`

/** Label used when identity SQL is null. */
export const UNSPECIFIED_PUBLISHER = "Unspecified"
