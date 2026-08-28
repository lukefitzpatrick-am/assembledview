# Stage 1 — Xano Endpoint Completion Checklist

**Status:** In progress  
**Canonical pattern:** `domain-4/discovery/xano-endpoint-shapes.md` + endpoint #207 (`media_plan_search`)  
**Validation:** Record each endpoint in `endpoint-validation.md` before ticking here.

## Exit criteria (Section 6)

- [ ] All 19 endpoints updated in Xano
- [ ] All 19 pass curl tests 1–4 (or failures resolved)
- [ ] Hotfix H1 committed and smoke-tested
- [ ] No repo changes except H1 (`digi-bvod/route.ts`)
- [ ] Edit page regression: BOSS002 v10 unchanged in dev
- [ ] Post-Stage-1 baseline in `domain-4/discovery/baseline-performance.md`
- [ ] No console/server errors on normal edit operations

---

## Group A — Traditional media

- [ ] `media_plan_radio` (#114)
- [ ] `media_plan_television`
- [ ] `media_plan_newspaper`
- [ ] `media_plan_magazines`
- [ ] `media_plan_ooh`
- [ ] `media_plan_cinema`

## Group B — Digital direct

- [ ] `media_plan_digi_display`
- [ ] `media_plan_digi_audio`
- [ ] `media_plan_digi_video`
- [ ] `media_plan_digi_bvod`
- [ ] `media_plan_integration`

## Group C — Programmatic

- [ ] `media_plan_prog_display`
- [ ] `media_plan_prog_video`
- [ ] `media_plan_prog_bvod`
- [ ] `media_plan_prog_audio`
- [ ] `media_plan_prog_ooh`

## Group D — Social, search-adjacent

- [ ] `media_plan_socialmedia` (confirm name in Xano)
- [ ] `media_plan_influencers`
- [ ] `media_plan_production` (inspect stack before changing)
