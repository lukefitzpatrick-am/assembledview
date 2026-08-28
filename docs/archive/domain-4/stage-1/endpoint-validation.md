# Stage 1 — Endpoint Validation Results

Record curl results after each Xano endpoint is updated (Section 4 of Stage 1 spec).

**Base URL:** `https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa`  
**Pass criteria:** Test 1 = N rows; Test 2 = M ≤ N; Test 3 = K ≤ N (different version subset); Test 4 = 0.

---

## media_plan_radio (#114)

- Applied:
- Test MBA:
- Test 1 (MBA only):
- Test 2 (MBA + latest version):
- Test 3 (MBA + prior version):
- Test 4 (MBA + version 999999):
- Pass/Fail:
- Notes:

## media_plan_television

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_newspaper

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_magazines

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_ooh

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_cinema

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_digi_display

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_digi_audio

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes: Confirm table name in Xano (may differ from browser path `digital_audio_line_items`).

## media_plan_digi_video

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_digi_bvod

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes: Browser GET fixed in H1 (`app/api/media_plans/digi-bvod/route.ts`).

## media_plan_integration

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes: Xano table may be `media_plan_integrations`.

## media_plan_prog_display

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_prog_video

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_prog_bvod

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_prog_audio

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_prog_ooh

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_socialmedia

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes: Confirm exact endpoint name in Xano (e.g. `media_plan_social`).

## media_plan_influencers

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes:

## media_plan_production

- Applied:
- Test MBA:
- Test 1:
- Test 2:
- Test 3:
- Test 4:
- Pass/Fail:
- Notes: **Check function stack in Xano first** — may already have join + filter (no-op if so).
