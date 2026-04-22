# Client-branded dashboards

## Theming foundation

Runtime colours and chart palettes are built in `lib/client-dashboard/theme.ts` from a minimal client payload. The React shell exposes CSS variables via `components/client-dashboard/ClientBrandProvider.tsx` (`--brand-primary`, `--brand-primary-dark`, `--brand-tint`) for dashboard UI and charts.

## Xano TODO

Add the following fields to the **clients** table (and return them on client payloads the app already loads):

| Field | Purpose |
| --- | --- |
| `brand_primary_hex` | Primary brand colour; drives `ClientBrandTheme.primary` and chart series order. |
| `brand_primary_dark_hex` | Darker primary for headers, emphasis, and contrast surfaces (`ClientBrandTheme.primaryDark`). |
| `dashboard_logo_url` | Optional logo for the client dashboard chrome (`ClientBrandTheme.logoUrl`). |

Optional tint override: `brand_primary_tint_hex` — if omitted, the app derives a light tint by mixing the effective primary with white.

Until these exist in Xano, `buildClientTheme` falls back to the in-app AV defaults (see `theme.ts`).
