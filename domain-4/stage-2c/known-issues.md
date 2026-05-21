# Stage 2c — Known issues (local notes)

See canonical list: [`../AUDIT_DOMAIN_4_KNOWN_ISSUES.md`](../AUDIT_DOMAIN_4_KNOWN_ISSUES.md)

## Production asymmetry (D4-K1)
Production route forwards `version_number` for forward-compat, but Xano filters MBA-only. MBA fallback when JS filter returns empty is **retained** — do not remove until schema gains `mp_plannumber`.

## Paginator redundancy (D4-K2)
`prog-display` / `prog-video` still call `fetchAllXanoPages`. After full Stage-1 Xano deploy, expect single-page responses. Removing the paginator is Stage 2d / tech-debt, not 2c.

## Xano rollout gap (D4-K5)
Integration smoke (2026-05-21) shows `version_number` on outbound URLs but raw ≠ kept for newspaper and prog-display until those Xano endpoints receive the Stage-1 filter stack (search #207 already works).
