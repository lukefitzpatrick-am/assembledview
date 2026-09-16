# Delivery source registry — confirm then fix

Status: open  
Date: 2026-09-16  
Source: `docs/superpowers/delivery-source-registry-inventory-2026-09-16.md` (DS-0). The 27 inventory items are unchanged.

Read the named file region before changing anything. Each item stays **UNCONFIRMED** until that read.

## Confirm then fix

- **DS-19 (UNCONFIRMED):** `filterRange` unused in `directDigitalAdapterShared.ts:302-303`. If true, Change range does nothing for Direct Booked Digital and BVOD.
- **DS-15 (UNCONFIRMED):** Search Top Impression Share expected is hardcoded 50% (`searchAdapter.ts:225,288-295,465-466`).
- **DS-4 (UNCONFIRMED):** Direct digital / BVOD hide the whole section when there are no ad-serving rows (`directDigitalAdapterShared.ts:315-316,372-374`); plan-only lines vanish instead of showing as awaiting.
- **DS-3 (UNCONFIRMED):** Reddit drops no-fact lines while Meta and TikTok keep them (`CampaignDeliverySection.tsx:150-189`).
