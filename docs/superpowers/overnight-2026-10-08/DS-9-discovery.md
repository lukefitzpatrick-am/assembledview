# DS-9 discovery

Verified with search across ts/tsx/js/css/json before delete.

Deleted (no importer outside the file, its tests, or docs):
- `components/ui/accent-bar.tsx`, `animated-dot-field.tsx`, `wave-ribbon.tsx`, `corner-dot-cluster.tsx`, `brand-mark-watermark.tsx`
- `lib/brand/brandMarkColours.ts` (only those components imported it)
- `lib/finance/cardHelpers.ts`
- `ClientBrandProvider` mount in `app/layout.tsx`, `components/client-dashboard/ClientBrandProvider.tsx`, `lib/client-dashboard/theme.ts`, `palette.ts`, `theme.test.ts`. `useClientBrand` had no caller.
- `publisherColourStripeBackground` in `lib/publisher/publisherColour.ts` (definition only)
- `styles/globals.css` (no import; app uses `app/globals.css`)
- `.eslintrc.json` (comment in `eslint.config.mjs` updated)
- `public/amlogo.png`, `assembled-logo.png`, `assembled-media-logo.png`, `ferris-wheel.jpg`, `white-building.jpg`, `modern-hallway.jpg`, `orange-lighthouse.jpg`

Kept:
- `ContainerEntryModeToggle.tsx` — `scripts/wire-ux5-entry-mode.mjs` and `scripts/fix-ux5-entry-mode.mjs` still name it
- `searchSeriesPalette.cost` — asserted in `channelMediaTypeColour.test.ts`
- `ChannelCoverageEntry.colour`, `ROLE_STYLES`, Button success/warning, Badge/ProgressBar `customColor`, deprecated `brandColour` props, Tailwind `brandPalette` — not swept this pass
- `next/font` Plus Jakarta Sans and Instrument Serif stay applied in `app/layout.tsx`
