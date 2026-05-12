# Stage 1 Summary

## Files Created

- `lib/mediaplan/serializeBurstsJson.ts:1-68`

## Files Modified

- `lib/mediaplan/schemas.ts:35-42`
- `lib/api.ts:1-5`, `lib/api.ts:1783-1884`, `lib/api.ts:1613`, `lib/api.ts:1675`, `lib/api.ts:1900`, `lib/api.ts:3153`, `lib/api.ts:3219`, `lib/api.ts:3274`, `lib/api.ts:3330`, `lib/api.ts:3385`, `lib/api.ts:3440`, `lib/api.ts:3495`, `lib/api.ts:3552`, `lib/api.ts:3614`, `lib/api.ts:3674`, `lib/api.ts:3747`, `lib/api.ts:3803`, `lib/api.ts:3864`, `lib/api.ts:3920`, `lib/api.ts:3975`, `lib/api.ts:4031`
- `components/media-containers/ProgDisplayContainer.tsx:31`, `components/media-containers/ProgDisplayContainer.tsx:643-649`
- `components/media-containers/ProgVideoContainer.tsx:31`, `components/media-containers/ProgVideoContainer.tsx:711-717`
- `components/media-containers/ProgAudioContainer.tsx:31`, `components/media-containers/ProgAudioContainer.tsx:634-640`
- `components/media-containers/ProgBVODContainer.tsx:31`, `components/media-containers/ProgBVODContainer.tsx:626-632`
- `components/media-containers/ProgOOHContainer.tsx:31`, `components/media-containers/ProgOOHContainer.tsx:647-653`
- `components/media-containers/DigitalDisplayContainer.tsx:27`, `components/media-containers/DigitalDisplayContainer.tsx:745-751`
- `components/media-containers/DigitalVideoContainer.tsx:26`, `components/media-containers/DigitalVideoContainer.tsx:705-711`
- `components/media-containers/DigitalAudioContainer.tsx:26`, `components/media-containers/DigitalAudioContainer.tsx:743-749`
- `components/media-containers/OOHContainer.tsx:23`, `components/media-containers/OOHContainer.tsx:698-704`
- `components/media-containers/IntegrationContainer.tsx:31`, `components/media-containers/IntegrationContainer.tsx:610-616`
- `components/media-containers/SearchContainer.tsx:31`, `components/media-containers/SearchContainer.tsx:685-690`
- `components/media-containers/SocialMediaContainer.tsx:31`, `components/media-containers/SocialMediaContainer.tsx:782-788`
- `components/media-containers/BVODContainer.tsx:26`, `components/media-containers/BVODContainer.tsx:796-802`
- `components/media-containers/InfluencersContainer.tsx:30`, `components/media-containers/InfluencersContainer.tsx:620-626`
- `components/media-containers/TelevisionContainer.tsx:33`, `components/media-containers/TelevisionContainer.tsx:1271-1280`
- `components/media-containers/RadioContainer.tsx:33`, `components/media-containers/RadioContainer.tsx:888-893`
- `components/media-containers/CinemaContainer.tsx:22`, `components/media-containers/CinemaContainer.tsx:637-643`
- `components/media-containers/NewspaperContainer.tsx:26`, `components/media-containers/NewspaperContainer.tsx:830-836`
- `components/media-containers/MagazinesContainer.tsx:26`, `components/media-containers/MagazinesContainer.tsx:857-863`

## Deviations

- `lib/api.ts` now accepts fee percentage from `lineItem.feePct`, `lineItem.feePercentage`, or `lineItem.fee_percentage` when present. If absent but the parsed burst payload already has Stage 1 `feeAmount`, it derives the percentage from that serialized value before calling `serializeBurstsJson`; this avoids overwriting container-computed writes with a zero-fee recalculation at the save boundary.
- `extractAndFormatBursts` still preserves container-specific extra burst fields such as Television `size` and `tarps`, while dropping legacy `fee`.

## Audit Differences

- `IntegrationContainer.tsx` did not match the audit's six-field legacy shape: its inline `bursts_json` block only emitted `budget`, `buyAmount`, `startDate`, and `endDate`. It now uses the shared serializer and emits the Stage 1 contract.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with pre-existing warnings in unrelated files.
- IDE lints for edited scope: no linter errors found.
- No test files were modified.
- `ProductionContainer.tsx` and `saveProductionLineItems` were not modified.
- `lib/mediaplan/expertChannelMappings.ts` was not modified.
- The inline getBursts closures in `ProgDisplayContainer.tsx` and `TelevisionContainer.tsx` were not modified.
