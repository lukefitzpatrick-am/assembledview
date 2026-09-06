# IG-13 — Onboard a publisher from one unmatched file

**Status:** Implemented  
**Surface:** `lib/mediaplans/ingest/proposePublisherProfile.ts`, `confirmPublisherProfile.ts`, `POST /api/admin/ingest/confirm-profile`, Hub `/admin/schedule-ingest`, AVA `ingest:profile:*` cards  
**Non-goals:** Live Anthropic in CI; guessing the catalogue publisher; storing workbook bytes (C-101); per-field Hub toggles (C-102)

## Flow

When detect confidence is below 0.5 (or no profile matches), the engine proposes a profile from the sheet: `detect_signature`, `column_map` against the AV target template, `money_rules` (basis, stated-total label, subtotal label, rate-card column), grid semantics and legend. The scorer is deterministic — never a per-publisher branch, never a live model.

The draft lives on staged `review.proposed_profile` with `confirmed: false`. Catalogue pick is still never guessed. `POST link-publisher` with a `stageId` stamps the draft and does not empty-insert. The planner confirms field by field (AVA cards) or reviews the Hub field list and Confirm. Insert stamps notes `model-proposed, confirmed by <email>` and `publisher_profile_changes.source = model_proposed`, then the normal pipeline re-runs with the pinned name.

`load_ingest_into_form`, Hub Accept, and `ingestReviewToFormLineItems` refuse unconfirmed drafts.

## Tests

JCD fixture with JCDecaux hidden: proposed `column_map` and `money_rules` deep-equal the handwritten seed. Unconfirmed load is refused. Confirm inserts notes + audit, then load is allowed.

`npm run test:ingest-review` includes `proposePublisherProfile.test.ts`.
