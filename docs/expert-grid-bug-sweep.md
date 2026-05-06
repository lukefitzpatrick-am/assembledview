# Expert grid bug sweep — discovery report

## Summary
- 20 media containers found
- 16 `map*ExpertRowsToStandardLineItems` mapping functions found in `expertChannelMappings.ts` (+ 1 `appendOohBurstFromExpertQty` helper)
- 14 channels affected by the bug pattern (need fix)
- 5 channels naturally exempt
- 1 channel already fixed correctly

## Per-channel matrix

| Channel | Container | Expert grid | Mapping fn | Mapping bug? | handleValueChange bug? | Loader bug? | Buy types supported |
|---|---|---|---|---|---|---|---|
| OOH | OOHContainer.tsx | OohExpertGrid.tsx | mapOohExpertRowsToStandardLineItems / appendOohBurstFromExpertQty (line 670 / 701) | ALREADY_FIXED | ALREADY_FIXED | ALREADY_FIXED | bonus, cpm, fixed_cost, package, package_inclusions, panels |
| Radio | RadioContainer.tsx | RadioExpertGrid.tsx | mapRadioExpertRowsToStandardLineItems (line 813) | AFFECTED (`buyAmountStr` bonus-only) | ALREADY_FIXED | AFFECTED (bonus-only explicit branch in loader) | bonus, cpm, fixed_cost, package, package_inclusions, spots |
| Television | TelevisionContainer.tsx | TelevisionExpertGrid.tsx | mapTvExpertRowsToStandardLineItems (line 1393) | AFFECTED (`buyAmountStr` bonus-only) | NOT_AFFECTED | NOT_AFFECTED | bonus, cpm, cpt, fixed_cost, package, spots |
| BVOD | BVODContainer.tsx | BVODExpertGrid.tsx | mapBvodExpertRowsToStandardLineItems (line 1784) | AFFECTED (`buyAmountStr` bonus-only) | NOT_AFFECTED | NOT_AFFECTED | bonus, cpc, cpm, cpv, fixed_cost, package_inclusions |
| Digital Video | DigitalVideoContainer.tsx | DigitalVideoExpertGrid.tsx | mapDigiVideoExpertRowsToStandardLineItems (line 2149) | AFFECTED (`buyAmountStr` bonus-only) | AFFECTED | NOT_AFFECTED | bonus, cpc, cpm, cpv, fixed_cost, package_inclusions |
| Digital Display | DigitalDisplayContainer.tsx | DigitalDisplayExpertGrid.tsx | mapDigitalDisplayExpertRowsToStandardLineItems (line 2529) | AFFECTED (`buyAmountStr` bonus-only) | NOT_AFFECTED | NOT_AFFECTED | bonus, cpc, cpm, cpv, fixed_cost, package_inclusions |
| Digital Audio | DigitalAudioContainer.tsx | DigitalAudioExpertGrid.tsx | mapDigitalAudioExpertRowsToStandardLineItems (line 2903) | AFFECTED (`buyAmountStr` bonus-only) | NOT_AFFECTED | NOT_AFFECTED | bonus, cpc, cpm, cpv, fixed_cost, package_inclusions |
| Social Media | SocialMediaContainer.tsx | SocialMediaExpertGrid.tsx | mapSocialMediaExpertRowsToStandardLineItems (line 3261) | AFFECTED (`buyAmountStr` bonus-only) | AFFECTED | NOT_AFFECTED | bonus, completed_views, conversion_value, cpc, cpm, cpv, fixed_cost, guaranteed_leads, landing_page_views, leads, manual_cpc, maximize_conversions, package_inclusions, reach |
| Search | SearchContainer.tsx | SearchExpertGrid.tsx | mapSearchExpertRowsToStandardLineItems (line 3620) | AFFECTED (`buyAmountStr` bonus-only) | AFFECTED | NOT_AFFECTED | bonus, cpc, cpm, cpv, fixed_cost, manual_cpc, maximize_conversions, package_inclusions, target_cpa, target_roas |
| Influencers | InfluencersContainer.tsx | InfluencersExpertGrid.tsx | mapInfluencersExpertRowsToStandardLineItems (line 3984) | AFFECTED (`buyAmountStr` bonus-only) | NOT_AFFECTED | NOT_AFFECTED | bonus, completed_views, conversion_value, cpc, cpm, cpv, fixed_cost, guaranteed_leads, landing_page_views, leads, manual_cpc, maximize_conversions, package_inclusions, reach |
| Integration | IntegrationContainer.tsx | IntegrationExpertGrid.tsx | mapIntegrationExpertRowsToStandardLineItems (line 4356) | AFFECTED (`buyAmountStr` bonus-only) | ALREADY_FIXED | NOT_AFFECTED | bonus, cpc, cpm, cpv, fixed_cost, manual_cpc, maximize_conversions, package, package_inclusions, target_cpa, target_roas |
| Newspaper | NewspaperContainer.tsx | NewspaperExpertGrid.tsx | mapNewspaperExpertRowsToStandardLineItems (line 4670) | AFFECTED (`buyAmountStr` bonus-only) | ALREADY_FIXED | ALREADY_FIXED | bonus, cpm, fixed_cost, insertions, package, package_inclusions |
| Magazines | MagazinesContainer.tsx | MagazinesExpertGrid.tsx | mapMagazineExpertRowsToStandardLineItems (line 4992) | AFFECTED (`buyAmountStr` bonus-only) | ALREADY_FIXED | ALREADY_FIXED | bonus, cpm, fixed_cost, insertions, package, package_inclusions |
| Prog Audio | ProgAudioContainer.tsx | ProgAudioExpertGrid.tsx | mapProgAudioExpertRowsToStandardLineItems (line 5518) | AFFECTED (`buyAmountStr` bonus-only) | AFFECTED | NOT_AFFECTED | bonus, clicks, completed_listens, conversions, cpc, cpm, cpv, fixed_cost, package_inclusions, reach |
| Prog BVOD | ProgBVODContainer.tsx | ProgBVODExpertGrid.tsx | mapProgBvodExpertRowsToStandardLineItems (line 5706) | NOT_AFFECTED | NOT_AFFECTED | NOT_AFFECTED | completed_views, cpc, cpm, cpv, fixed_cost, reach, target_cpa, viewability |
| Prog Display | ProgDisplayContainer.tsx | ProgDisplayExpertGrid.tsx | mapProgDisplayExpertRowsToStandardLineItems (line 5893) | NOT_AFFECTED | NOT_AFFECTED | NOT_AFFECTED | clicks, conversions, cpc, cpm, cpv, fixed_cost, reach, viewability |
| Prog Video | ProgVideoContainer.tsx | ProgVideoExpertGrid.tsx | mapProgVideoExpertRowsToStandardLineItems (line 6084) | NOT_AFFECTED | AFFECTED | ALREADY_FIXED | bonus, completed_views, cpc, cpm, cpv, fixed_cost, package_inclusions, reach, target_cpa, viewability |
| Prog OOH | ProgOOHContainer.tsx | ProgOOHExpertGrid.tsx | mapProgOohExpertRowsToStandardLineItems (line 6281) | NOT_AFFECTED | NOT_AFFECTED | NOT_AFFECTED | clicks, conversions, cpc, cpm, cpv, fixed_cost, reach, viewability |
| Cinema | CinemaContainer.tsx | (none) | (none in expertChannelMappings.ts) | NOT_AFFECTED | NOT_AFFECTED | NOT_AFFECTED | bonus, cpm, fixed_cost, package, package_inclusions, spots |
| Production | ProductionContainer.tsx | (none) | (none in expertChannelMappings.ts) | NOT_AFFECTED | NOT_AFFECTED | NOT_AFFECTED | n/a |

## Action items
- Radio: extend `buyAmountStr` manual-qty handling beyond `bonus` in `mapRadioExpertRowsToStandardLineItems`, and align loader explicit branches for `package` / `package_inclusions`.
- Television: extend `buyAmountStr` `"0"` handling to include manual-qty buy types (`package` where applicable).
- BVOD: extend `buyAmountStr` `"0"` handling for `package_inclusions` in expert->standard mapping.
- Digital Video: add early return/manual-qty guard in `handleValueChange` for `package_inclusions`, and extend mapping `buyAmountStr` handling.
- Digital Display: extend mapping `buyAmountStr` manual-qty handling for `package_inclusions`.
- Digital Audio: extend mapping `buyAmountStr` manual-qty handling for `package_inclusions`.
- Social Media: add early return/manual-qty guard in `handleValueChange` for `package_inclusions`, and extend mapping `buyAmountStr` handling.
- Search: add early return/manual-qty guard in `handleValueChange` for `package_inclusions`, and extend mapping `buyAmountStr` handling.
- Influencers: extend mapping `buyAmountStr` manual-qty handling for `package_inclusions`.
- Integration: extend mapping `buyAmountStr` manual-qty handling for `package` and `package_inclusions`.
- Newspaper: extend mapping `buyAmountStr` manual-qty handling for `package` and `package_inclusions`.
- Magazines: extend mapping `buyAmountStr` manual-qty handling for `package` and `package_inclusions`.
- Prog Audio: add early return/manual-qty guard in `handleValueChange` for `package_inclusions`, and extend mapping `buyAmountStr` handling.
- Prog Video: add early return/manual-qty guard in `handleValueChange` for `package_inclusions`.

## Files unchanged in this commit
This is a discovery commit only. No code changes.
