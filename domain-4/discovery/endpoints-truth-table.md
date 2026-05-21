# Domain 4 — Line-item endpoints truth table (Task 2.2)

**Branch context:** `domain-4-search-pilot` (long-lived) · **Code snapshot:** `cfd1892265b0d5b15d2ad3f3088b8b91aa363c6f`  
**Legend — `route_layer_pattern`:**  
- `A_search_legacy` — resolve version via `getVersionNumberForMBA`; Xano query **MBA only**; `filterLineItemsByPlanNumber` in route  
- `B_production_shotgun` — forward `mp_plannumber` + `version_number` + `media_plan_version`; JS filter (+ production MBA fallback)  
- `C_television_modern` — `fetchAllXanoPages` + `lineItemPaginationParams`; JS filter  
- `D_catchall_proxy` — `[...path]` forwards path + query params; **no** route JS filter  

**Legend — `current_filter_status` (runtime today):**  
- `UNFILTERED` — Xano returns all rows for MBA (version query params ignored if sent)  
- `FILTERED_VIA_JS` — route and/or edit page applies `filterLineItemsByPlanNumber`  
- `XANO_READY_NOT_WIRED` — Xano endpoint updated (search #207) but Next route still MBA-only query  
- `UNKNOWN_NEEDS_TEST` — Xano function stack not verified in UI / curl yet  

**`target_filter_status`:** always `FILTERED_AT_XANO` post-rollout.

| media_type_key | display_label | getter_name | browser_path_segment | route_handler_path | xano_table_name | route_layer_pattern | current_filter_status | target_filter_status | notes |
|----------------|---------------|-------------|----------------------|--------------------|-----------------|---------------------|----------------------|---------------------|-------|
| mp_television | Television | getTelevisionLineItemsByMBA | television | app/api/media_plans/television/route.ts | media_plan_television | C_television_modern | FILTERED_VIA_JS | FILTERED_AT_XANO | Paginated Xano fetch; edit page double-filters |
| mp_radio | Radio | getRadioLineItemsByMBA | media_plan_radio | app/api/media_plans/[...path]/route.ts | media_plan_radio | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | Filter only on edit page (#114 cited unfiltered in §0) |
| mp_newspaper | Newspaper | getNewspaperLineItemsByMBA | newspaper | app/api/media_plans/newspaper/route.ts | media_plan_newspaper | A_search_legacy | FILTERED_VIA_JS | FILTERED_AT_XANO | MBA-only Xano GET |
| mp_magazines | Magazines | getMagazinesLineItemsByMBA | media_plan_magazines | app/api/media_plans/[...path]/route.ts | media_plan_magazines | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | Edit-page filter only |
| mp_ooh | OOH | getOOHLineItemsByMBA | media_plan_ooh | app/api/media_plans/[...path]/route.ts | media_plan_ooh | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | Edit-page filter only |
| mp_cinema | Cinema | getCinemaLineItemsByMBA | cinema | app/api/media_plans/cinema/route.ts | media_plan_cinema | A_search_legacy | FILTERED_VIA_JS | FILTERED_AT_XANO | MBA-only Xano GET |
| mp_digidisplay | Digital Display | getDigitalDisplayLineItemsByMBA | media_plan_digi_display | app/api/media_plans/[...path]/route.ts | media_plan_digi_display | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | Path segment = table name |
| mp_digiaudio | Digital Audio | getDigitalAudioLineItemsByMBA | digital_audio_line_items | app/api/media_plans/[...path]/route.ts | digital_audio_line_items | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | **Path ≠** server getter table `media_plan_digi_audio` — confirm Xano API group name |
| mp_digivideo | Digital Video | getDigitalVideoLineItemsByMBA | digital_video_line_items | app/api/media_plans/[...path]/route.ts | digital_video_line_items | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | **Path ≠** server getter `media_plan_digi_video` |
| mp_bvod | BVOD | getBVODLineItemsByMBA | digi-bvod | app/api/media_plans/digi-bvod/route.ts (POST only) | media_plan_digi_bvod | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | **GET likely 405** on dedicated route; server getter hits `media_plan_digi_bvod` directly |
| mp_integration | Integration | getIntegrationLineItemsByMBA | integration | app/api/media_plans/integration/route.ts | media_plan_integrations | C_television_modern | FILTERED_VIA_JS | FILTERED_AT_XANO | Table name plural `integrations` |
| mp_production | Production | getProductionLineItemsByMBA | production | app/api/media_plans/production/route.ts | media_plan_production | B_production_shotgun | FILTERED_VIA_JS | FILTERED_AT_XANO | Sends 3 version params; MBA-only fallback if filter empty |
| mp_search | Search | getSearchLineItemsByMBA | search | app/api/media_plans/search/route.ts | media_plan_search | A_search_legacy | XANO_READY_NOT_WIRED | FILTERED_AT_XANO | **#207** Xano filters with `version_number` (curl); route still MBA-only + JS filter |
| mp_socialmedia | Social Media | getSocialMediaLineItemsByMBA | social | app/api/media_plans/social/route.ts | media_plan_social | C_television_modern | FILTERED_VIA_JS | FILTERED_AT_XANO | Paginated |
| mp_progdisplay | Programmatic Display | getProgDisplayLineItemsByMBA | prog-display | app/api/media_plans/prog-display/route.ts | media_plan_prog_display | C_television_modern | FILTERED_VIA_JS | FILTERED_AT_XANO | Dedicated route (not catch-all) |
| mp_progvideo | Programmatic Video | getProgVideoLineItemsByMBA | prog-video | app/api/media_plans/prog-video/route.ts | media_plan_prog_video | C_television_modern | FILTERED_VIA_JS | FILTERED_AT_XANO | Paginated |
| mp_progbvod | Programmatic BVOD | getProgBVODLineItemsByMBA | prog_bvod_line_items | app/api/media_plans/[...path]/route.ts | prog_bvod_line_items | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | **Path ≠** server getter `media_plan_prog_bvod` |
| mp_progaudio | Programmatic Audio | getProgAudioLineItemsByMBA | prog_audio_line_items | app/api/media_plans/[...path]/route.ts | prog_audio_line_items | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | **Path ≠** server getter `media_plan_prog_audio` |
| mp_progooh | Programmatic OOH | getProgOOHLineItemsByMBA | prog_ooh_line_items | app/api/media_plans/[...path]/route.ts | prog_ooh_line_items | D_catchall_proxy | FILTERED_VIA_JS | FILTERED_AT_XANO | **Path ≠** server getter `media_plan_prog_ooh` |
| mp_influencers | Influencers | getInfluencersLineItemsByMBA | influencers | app/api/media_plans/influencers/route.ts | media_plan_influencers | C_television_modern | FILTERED_VIA_JS | FILTERED_AT_XANO | Paginated |

## Pattern counts (code layer)

| Pattern | Count | Media types |
|---------|------:|-------------|
| A_search_legacy | 3 | search, cinema, newspaper |
| B_production_shotgun | 1 | production |
| C_television_modern | 6 | television, social, integration, influencers, prog-display, prog-video |
| D_catchall_proxy | 10 | radio, magazines, ooh, digi-display, digi-audio, digi-video, bvod*, prog-bvod, prog-audio, prog-ooh |

\* BVOD browser GET path ambiguous — see notes column.

## Xano filter status (requires Tasks 3.1–3.2 + Section 4 curl)

| Endpoint | Expected pre-rollout | Post–#207 search |
|----------|---------------------|------------------|
| media_plan_search (#207) | UNFILTERED via app | FILTERED_AT_XANO when `version_number` sent (pilot) |
| media_plan_radio (#114) | UNFILTERED | UNFILTERED until Stage 1 |
| All others | UNKNOWN_NEEDS_TEST (assume UNFILTERED) | — |

Fill Xano column after Luke completes Tasks 3.1, 3.2, and curl tests.
