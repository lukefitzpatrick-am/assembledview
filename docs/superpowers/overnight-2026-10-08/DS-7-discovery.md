# DS-7 discovery (read-only)

No web app manifest (`*.webmanifest` / app manifest). Do not create one. No icon rail: `Sidebar` defaults to `collapsible="offcanvas"` (`components/ui/sidebar.tsx:184`), so collapse hides the sidebar. Dot mark is still wired for `collapsible=icon`.

## Will edit

- Copy assets into `public/brand/` and `public/brand/signin/`. Replace `app/icon.svg`. Add `app/apple-icon.png`. `public/brand/icon-512.png`.
- `app/globals.css:78` and `:243` `--sidebar-active-fg` → ink `137 32% 9%`.
- `components/ui/sidebar.tsx:458` group label 11px → 10px. `:531` active tint + 3px bar → lime pill (`--sidebar-active-bg` / `--sidebar-active-fg`). `:625` menu-action active bar colour. `:742` sub-button active → same pill.
- `components/AppSidebar.tsx:271` logo `/amlogo.png` → `/brand/logo-inverted-white.png` 176px; dot mark for icon collapse. `:401-409` footer unchanged structurally; mobile nav drops `shadow-e2` and blur, ink background, lime pill active.
- `components/UserMenu.tsx:54` white `bg-background` card → `bg-am-panel` (`tokens.json` `colour.panel` `#1A2620` already exists; no new token). White name, muted email, `rounded-card`.
- `components/ClientLayout.tsx:81` header `bg-card` → white / `dark:bg-am-panel`, no shadow. `:210` greeting muted.
- `app/page.tsx` replace carousel. Keep `useUser`, mounted gate, redirect, both `/auth/login` hrefs, `/privacy`. Left headline is a `p` (one `h1` on the right). Reset uses `Button` `secondary` (forest border); `outline` is `border-input`.
- `components/brand/BrandLoading.tsx` new. `components/AuthLoadingState.tsx` full-screen loaders. `app/mediaplans/mba/[mba_number]/edit/loading.tsx` (only spinner `loading.tsx`; the other three are skeletons).
- `components/ui/loading-dots.tsx` already `bg-primary`. Leave the API.
- `app/error.tsx`, `app/not-found.tsx`, `app/client/error.tsx` → `PageHeader`. `app/global-error.tsx` button uses `BRAND.colour` inline (no root CSS).
- `app/(internal)/design-system/page.tsx` Brand assets section. Entity-mark logo example switches to `/brand/logo-full-colour.png`.
- `docs/brain/MAP.md`, `docs/brain/KNOWN-ISSUES.md` (Auth0 hosted login is not this code).
