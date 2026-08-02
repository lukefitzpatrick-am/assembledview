# X6 — Vault plan files → Vercel Blob

Status: decided (2026-08-02) — **B: Vercel Blob** (not Supabase Storage)

## Decision

Migrate ~512 MiB of plan vault files (`media_plan` / `mba_pdf` / `aa_media_plan` jsonb on `media_plan_versions`) to **Vercel Blob**. Creative assets and Xero PDFs are already on Blob with proven writers and zero vault rows. Adding Supabase Storage mid-soak would introduce a second storage system for no functional gain. A later “everything under Supabase” program is fine — do not couple it to Xano severance.

## Probe facts

- Vault has **no listing API** (~15% confidence on discovery endpoints; 403/404).
- Enumeration path is **PG jsonb only** (always was).
- Sample vault file GETs return **206** xlsx with or without bearer (~85% confidence public downloads work).

## Hard caveats (must ship with migration)

1. **Checksum every copied file** (source bytes vs Blob bytes / content hash) — do not trust size alone.
2. **Keep vault-URL read-fallback** until a full week of **zero** fallback reads in logs. Public vault URLs mean day-one breakage is unlikely — that is exactly how silent gaps hide.

## Implementation checklist (when executing)

1. For each PG row with `a2.xano.io/vault` (or `/vault` path): download → put Blob → rewrite jsonb `{url,pathname,filename,size,mime}` (+ store checksum).
2. Dual-run: leave Xano blobs intact; app reads PG URLs with vault fallback.
3. Rewire `/api/mediaplans/versions/[id]/documents` off `XANO_SAVE_FILE_*`.
4. AA export / MBA PDF download paths use Blob URLs.
5. Do not re-migrate Xero/creative. Update register §2 to zeros when residual vault count is zero.
