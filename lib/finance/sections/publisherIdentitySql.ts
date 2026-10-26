import { PUBLISHER_NAME_ALIASES } from "@/lib/publisher/resolvePublisherName"

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

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * SQL twin of `resolvePublisherNameMatch` (lib/publisher/resolvePublisherName.ts)
 * for the billing agency join: trimmed and case-insensitive name, lowest
 * `publishers.id`; then a `PUBLISHER_NAME_ALIASES` alias; then a
 * `publishers.publisherid` no other publisher shares. Blank text matches
 * nothing. Returns `LEFT JOIN LATERAL (...) p ON TRUE` exposing `p.billingagency`.
 */
export function publisherAgencyLateralSql(identityExpr: string): string {
  const aliasCases = Object.entries(PUBLISHER_NAME_ALIASES)
    .map(([key, name]) => `WHEN ${sqlText(key)} THEN ${sqlText(name.trim().toLowerCase())}`)
    .join(" ")
  const aliasExpr = aliasCases ? `(CASE pk.k ${aliasCases} END)` : "NULL"
  return `LEFT JOIN LATERAL (
  SELECT p.billingagency
  FROM (SELECT LOWER(BTRIM(COALESCE(${identityExpr}, ''))) AS k) pk
  JOIN publishers p ON pk.k <> '' AND (
    LOWER(BTRIM(p.publisher_name)) = pk.k
    OR LOWER(BTRIM(p.publisher_name)) = ${aliasExpr}
    OR (
      LOWER(BTRIM(p.publisherid)) = pk.k
      AND NOT EXISTS (
        SELECT 1 FROM publishers p2
        WHERE p2.id <> p.id AND LOWER(BTRIM(p2.publisherid)) = pk.k
      )
    )
  )
  ORDER BY
    CASE
      WHEN LOWER(BTRIM(p.publisher_name)) = pk.k THEN 0
      WHEN LOWER(BTRIM(p.publisher_name)) = ${aliasExpr} THEN 1
      ELSE 2
    END,
    p.id
  LIMIT 1
) p ON TRUE`
}
