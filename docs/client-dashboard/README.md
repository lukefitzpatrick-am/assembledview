# Client dashboards

Client dashboard screens use the app brand tokens (`lib/brand`) and the shared status and channel colours. There is no per-client theme object.

The page shell is `components/dashboard/ClientDashboardPageContent.tsx`.

A client can still carry a brand colour string via `lib/clients/brandColour.ts` (`DEFAULT_CLIENT_BRAND_COLOUR`). That value is sky (`#49C7EB`). It does not restyle the dashboard chrome.
