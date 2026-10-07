OVERNIGHT RUN: brand 05b design system, DS-6, DS-7, DS-8, DS-E, DS-10, DS-9.
Unattended. Luke is asleep and will smoke everything in the morning. Work through every pack in order.
Never stop the whole run for one pack's problem: park that pack and move on (see Run protocol).

=====================================================================
A. RUN PROTOCOL (read twice)
=====================================================================

A1. First action: create docs/superpowers/overnight-2026-10-08/ and save this entire prompt, verbatim,
    as docs/superpowers/overnight-2026-10-08/PROMPT.md. Create RUNLOG.md beside it.
    If your context is ever summarised or you lose track, re-read PROMPT.md and RUNLOG.md before
    doing anything else, then continue from the first pack not marked DONE or PARKED.

A2. Baseline before any edit. Run and record in RUNLOG.md (exit code, counts, failing test names):
    git rev-parse --short HEAD (expect eaee04fb)
    git status --short
    npm run typecheck
    npm run lint
    npm run test:brand ; npm run test:status ; npm run test:media-families ; npm run test:charts-registry ;
    npm run test:client-dashboard
    npm run test:all   (pre-existing failures are the baseline; later packs must not add new ones)

A3. Pack order: DS-6, DS-7, DS-8, DS-E, DS-10, DS-9.
    (DS-9 moved to the end on purpose so it can retire what DS-6 to DS-10 leave unused.)

A4. Every pack runs: Discovery note -> Build -> Checks -> Commit or Park -> RUNLOG entry.
    - Discovery note: before editing, write docs/superpowers/overnight-2026-10-08/DS-x-discovery.md with
      file:line for everything the pack will touch. Keep it short. Read-only.
    - Build: only what the pack allows.
    - Checks: the pack's check list. Fix failures you caused, inside the pack's scope.
    - Commit (see A5) only if every check is green or no worse than the A2 baseline.
    - Park (see A6) if checks still fail after two honest fix attempts, or if a pack STOP condition hits.

A5. Git permission for tonight only (Luke, 7 Oct 20:45). Allowed, and nothing else:
      git status --short
      git diff --stat
      git diff -- <explicit paths>
      git add -- <explicit path> <explicit path> ...   (every path written out; deleted files may be added by path)
      git commit -m "<message given in the pack>"
      git rev-parse --short HEAD
      git restore -- <explicit paths>                  (ONLY when parking, ONLY files this pack changed)
    Forbidden: push, pull, fetch, amend, reset, rebase, merge, checkout, switch, stash, clean, rm,
    add -A, add ., commit -a, tag, branch changes, any flag that rewrites history.
    Before each commit: git status --short, and confirm every staged path belongs to this pack.
    Never stage files under docs/superpowers/overnight-2026-10-08/ except in the final commit (A8).
    Never stage CODEX_FOUNDATION_DISCOVERY.md, CODEX_REPAIR_DISCOVERY.md or the four untracked
    docs/superpowers discovery files that existed before this run.

A6. Parking a pack:
    1. git diff -- <this pack's changed tracked paths> > docs/superpowers/overnight-2026-10-08/DS-x-parked.patch
    2. Move any new untracked files this pack created into docs/superpowers/overnight-2026-10-08/DS-x-parked/
       keeping their relative paths.
    3. git restore -- <this pack's changed tracked paths>
    4. git status --short must match the state before the pack started.
    5. RUNLOG: PARKED, the reason, the failing output (trimmed), and what you would try next.
    A later pack that depends on a parked pack skips only the dependent steps and logs them.

A7. RUNLOG.md entry per pack:
    ## DS-x  DONE <hash> | PARKED
    - Started / finished (local time)
    - Files changed (full list)
    - Checks and exit codes
    - Decisions you had to make, each with a confidence %
    - Anything under 90% confidence
    - Left for later (with file:line)
    - Morning smoke items for this pack (what Luke should open and what he should see)

A8. After the last pack: run the final checks (section J), then commit only the overnight folder:
    git add -- docs/superpowers/overnight-2026-10-08/PROMPT.md docs/superpowers/overnight-2026-10-08/RUNLOG.md
    plus every DS-x-discovery.md and any parked patch file, explicit paths.
    git commit -m "docs(design): overnight DS-6 to DS-10 run log"

=====================================================================
B. GLOBAL RULES (every pack)
=====================================================================

- Read first: CLAUDE.md, docs/brain/MAP.md, docs/brain/BLAST-RADIUS.md, docs/brain/INVARIANTS.md,
  docs/brain/KNOWN-ISSUES.md, docs/brain/CONVENTIONS.md, docs/superpowers/DISCOVERY-brand-05b-ui.md,
  docs/superpowers/DISCOVERY-design-system-consolidation.md, lib/brand/index.ts, lib/brand/tokens.json,
  lib/design/status.ts, lib/design/mediaFamilies.ts, lib/chart-theme.ts, components/layout/*.
- PowerShell only. Select-String for search. No && chaining.
- No npm install, no new dependencies, no network downloads. Brand assets are already on disk (section C).
- Never touch: lib/pacing/maths/** (the Snowflake ladder, computeStatus), any SQL, db/**, app/api/**
  route logic, auth, data fetching, money maths, billing logic, save/publish flows. This run changes
  presentation only: classes, styles, colours, fonts, copy named in a pack, and assets.
- Colours come from lib/brand (BRAND.colour, BRAND.functional, BRAND.derived) or existing CSS tokens.
  No new hex literals outside lib/brand, lib/chart-theme.ts and the files a pack names.
- The ESLint hex-ban baseline in eslint.config.mjs ("DS-2 baseline ... Do not add to this list"):
  never add a file. Remove a file from it when this run leaves it clean.
- Brand rules: no gradients, no shadows (shadow-*, box-shadow, drop-shadow) on new or edited surfaces,
  pills and arches, lime and sky are never text on white or sand, amber and coral are status only (D2),
  one serif italic phrase per headline at most, full stops on page and section titles only (D5),
  media colour only as dots, stripes, rails, accent borders and chart marks, never text or a fill
  behind text (DS-5.1 invariant), client and publisher colour only on their mark (D4, D15).
- Keys, exported names and prop signatures stay unless a pack says otherwise. A prop that no longer
  paints keeps its signature and gets a one-line @deprecated comment; DS-9 removes it if unused.
- Tests: when an existing test asserts an old colour, class or copy that a pack changes on purpose,
  update the expectation only, never the logic. Search both tests/ and every __tests__ folder.
- If a file differs from what a pack describes, re-read it, adapt only if the intent is unambiguous,
  and log it. If the intent is not clear, skip that item and log it. Do not guess.
- Docs: each pack updates docs/brain (INVARIANTS, BLAST-RADIUS, KNOWN-ISSUES, MAP) for what it changed.

Decisions in force: D1 light default, black hero band on campaign covers, black mode per user.
D2 amber and coral functional only. D4 client colour only on the client mark. D5 full stops on page
and section titles only. D7 sand canvas, white cards. D8 Aptos in Excel and email, Plus Jakarta Sans
embedded in PDFs. D9 default Button is the lime pill. D11 seven media families. D12 print context black,
production context. D13 active segments are the lime pill with ink text (segmentChipClass).
D14 (tonight) Cursor commits per pack with explicit paths. D15 publisher colour only on the publisher mark.
D16 campaign elapsed-time bar is forest, one colour. D17 DS-8 covers every route in priority order.

=====================================================================
C. BRAND ASSETS (already on disk, git-excluded staging folder)
=====================================================================

"Claude outputs/brand-05b-assets/" contains:
  logos/logo-full-colour.png, logo-inverted-white.png, logo-one-colour-ink.png, logo-grayscale.png (1000x148)
  icons/icon.svg (ink rounded square, lime dot mark), icons/apple-icon.png (180), icons/icon-512.png,
        icons/dot-mark-lime.svg, icons/dot-mark-lime-96.png
  photos/signin-arch-1.jpg, signin-arch-2.jpg, signin-arch-3.jpg (840 wide, brand library ids
        5709526, 26184235, 12083782; arch 3 shows a phone in hand at about 52% across, 45% down)
  fonts/PlusJakartaSans-Regular.ttf, -Bold.ttf, -ExtraBold.ttf, InstrumentSerif-Regular.ttf,
        InstrumentSerif-Italic.ttf, OFL-PlusJakartaSans.txt, OFL-InstrumentSerif.txt (SIL OFL 1.1)
Copy (do not move) what a pack needs into the repo at the path the pack gives. Never stage anything
under "Claude outputs/".

=====================================================================
D. DS-6  CLIENT AND PUBLISHER COLOUR ONLY ON THEIR MARK (D4, D15, D16)
=====================================================================

Goal: client brand colour and publisher colour paint exactly one thing, the entity's mark.

Known consumers (verify in the discovery note; DISCOVERY-brand-05b-ui.md section 6 has more):
  components/client-dashboard/ClientBrandProvider.tsx, lib/client-dashboard/theme.ts, palette.ts
  components/dashboard/PageHeroShell.tsx (PageHeroShell, PageHeroTitleBlock brandColour)
  components/dashboard/HeroBanner.tsx, components/dashboard/campaign/CampaignHeroBanner.tsx (dot :101)
  components/dashboard/campaign/CampaignSummaryRow.tsx (:53-73 elapsed bar, timelineElapsedFallbackColor)
  components/dashboard/campaign/SpendChartsRow.tsx, components/dashboard/SpendingInsightsSection.tsx
  components/dashboard/CampaignCardCompact.tsx (--brand-color :160)
  components/dashboard/ClientDashboardPageContent.tsx (passes clientData.brandColour 7 times)
  components/dashboard/delivery/** (CampaignDeliverySection and every channel adapter's brandColour,
    DeliveryDailyChart, DeliveryPacingChart, LineItemDailyDeliveryChart, LineItemBlock, ChannelSection)
  components/dashboard/modals/ClientBrainSlideOver, ClientDetailsSlideOver, ClientFinanceSlideOver,
    ClientKpiSlideOver (brand-hex gradient stripes, UI-6)
  components/mediaplans/MediaPlanEditorHero.tsx
  app/dashboard/[slug]/[mba_number]/components/CampaignPageAssembly.tsx
  app/publishers/PublishersPageClient.tsx (:55, :104, :570-593), app/publishers/[publisherId]/
    PublisherDetailClient.tsx (PUBLISHER_HERO_ACCENT), PublisherDetailCharts.tsx, PublisherDetailsSlideOver.tsx,
    PublisherKpiSlideOver.tsx, lib/publisher/publisherColour.ts (publisherColourStripeBackground)

Build:
1. lib/brand/index.ts: add export function readableTextOn(hex: string): string returning BRAND.colour.ink
   or BRAND.colour.white by WCAG relative luminance (pick the higher contrast). Add tests to
   lib/brand/__tests__/parity.test.ts or a new lib/brand/__tests__/readableTextOn.test.ts
   (lime -> ink, forest -> white, sand -> ink, ink -> white) and include it in test:brand.
2. New components/brand/EntityMark.tsx:
   export function EntityMark({ name, colour, logoUrl, size = "md", kind = "client" })
   - logoUrl present: the logo in a white rounded-input box with a 1px border-border, object-contain.
   - otherwise: a rounded-full circle filled with the entity colour (fallback BRAND.colour.context when
     missing or invalid), initials (max 2) in readableTextOn(colour), font-bold.
   - sizes sm 20px, md 28px, lg 40px. aria-hidden when the name is shown next to it, else aria-label.
   - This is the only component allowed to paint a client or publisher colour.
   Export ClientMark and PublisherMark as thin wrappers.
3. Hero shells: PageHeroShell and PageHeroTitleBlock stop painting brandColour (no dot, no tint, no stripe,
   no watermark colour). Where the hero shows a client or publisher name, render the mark beside it.
   CampaignHeroBanner :101 dot becomes ClientMark. HeroBanner shows ClientMark (keeps the existing
   client logo when clientLogo is set, via logoUrl).
4. CampaignSummaryRow elapsed bar (D16, UI-4): one forest fill on the context track in light, forest light
   in dark, from tokens (report which token). Delete timelineElapsedFallbackColor and its blue/green/amber
   bands; update any test that asserted them.
5. Charts and delivery: every chart series, line, bar, area, dot or legend that used brandColour now uses
   the chart theme: a media-type series uses getMediaColor (family colour); a single "this campaign" or
   "actual" series uses BRAND.colour.forest; planned/expected/benchmark series use BRAND.colour.context;
   other series use BRAND_SERIES in order. Keep the brandColour props in adapter and component signatures
   (deprecated, unused for paint).
6. CampaignCardCompact: stop setting --brand-color for paint; show ClientMark next to the client name.
   Remove any style that read var(--brand-color).
7. Client slide-overs (4) and publisher slide-overs (2), PublishersPageClient cards and PublisherDetail:
   remove brand-hex and primary gradient stripes and tinted chips (UI-6); show the mark in the header.
   Publisher hero accent PUBLISHER_HERO_ACCENT stops painting. publisherColourStripeBackground: leave the
   function (DS-9 retires it if unused).
8. ClientBrandProvider stays mounted for now (DS-9 decides). getChartPalette must have no runtime caller
   after this pack; report.
9. Forms that edit brand_colour / publisher_colour stay as they are (the mark still uses the value).
   Add a small EntityMark preview next to each colour field if the field is in AddClientForm,
   EditClientForm or AddPublisherForm and the change is one element; otherwise skip and log.
10. /design-system: add an "Entity marks" Section showing ClientMark with logo, with colour (lime, forest,
    sky, an invalid value) at sm/md/lg, and PublisherMark.
11. Docs: INVARIANTS "Client and publisher colour paint only EntityMark (components/brand/EntityMark.tsx).";
    KNOWN-ISSUES close UI-4 and UI-6 (or note what remains); BLAST-RADIUS row for EntityMark and
    readableTextOn; MAP entries.

STOP conditions for DS-6 (park): a change would alter data, props from the API, or saved values;
or more than 40 files need edits (log the list and do the first 40 by priority: hero, charts, cards,
slide-overs, publishers).

Checks: typecheck, lint, test:brand, test:status, test:media-families, test:charts-registry,
test:client-dashboard, test:campaign-dashboard-range, test:delivery-ui, test:social-delivery,
test:programmatic-delivery, test:search-delivery-tiles, test:campaign-row-actions, plus every test touched.
Commit: git commit -m "feat(ui): client and publisher colour only on their mark (DS-6)"
Morning smoke: client dashboard, a campaign page (hero, summary row, delivery charts), campaign cards on
/dashboard, client slide-overs, /publishers and a publisher detail page, /design-system Entity marks.

=====================================================================
E. DS-7  SHELL, SIDEBAR, LOGO, FAVICON, SIGN-IN, LOADING STATES
=====================================================================

Build:
1. Assets: copy into public/brand/: logo-full-colour.png, logo-inverted-white.png, logo-one-colour-ink.png,
   dot-mark-lime.svg, and public/brand/signin/signin-arch-1.jpg, -2.jpg, -3.jpg.
   Replace app/icon.svg with icons/icon.svg. Add app/apple-icon.png from icons/apple-icon.png.
   Copy icons/icon-512.png to public/brand/icon-512.png and point any manifest at it if one exists
   (Select-String for manifest; if none, do not create one).
2. Sidebar (components/AppSidebar.tsx, components/ui/sidebar.tsx, app/globals.css sidebar tokens):
   - Logo: /brand/logo-inverted-white.png, 176px wide, height auto, in the header (replaces /amlogo.png).
     Collapsed icon rail (if the sidebar has one): /brand/dot-mark-lime.svg at 28px.
   - Active item (desktop menu button and mobile bottom nav): the lime pill. rounded-pill,
     background lime (hsl(var(--sidebar-active-bg))), text and icon ink. Remove the 3px active bar and the
     active tint. Hover keeps var(--sidebar-hover-tint). Focus ring stays.
   - --sidebar-active-fg becomes ink (137 32% 9%) in :root and .dark; update parity expectations if the
     token is covered.
   - Group labels: 10px, semibold, uppercase, tracking-wide, sidebar muted. Keep the admin "muted" tone
     (routeManifest.test.ts:151 must still pass).
   - Footer user card (UserMenu in SidebarFooter): no white box. Panel surface (#1A2620 via an existing
     token, or add --sidebar-panel to globals.css and tokens.json as BRAND.colour.panel with parity), white
     name, muted email, rounded-card, no shadow.
   - Mobile bottom nav: remove shadow-e2 and backdrop blur; ink background.
3. Top bar (components/ClientLayout.tsx header, 48px): white in light, panel in dark, 1px bottom border,
   no shadow. UserGreeting text muted. Leave layout and breakpoints alone.
4. Sign-in page app/page.tsx. Keep all auth behaviour exactly (useUser, mounted gate, redirect to
   /dashboard when signed in, the two /auth/login links and their query strings, /privacy link).
   Replace the carousel. Remove the carousel state, interval and framer-motion import if unused.
   Layout (desktop): two columns, minmax(0,1.15fr) and minmax(0,1fr), min-h-screen.
   Left panel: ink background, white text, padding 40px 48px, column with space-between.
     - Top: /brand/logo-inverted-white.png at 200px wide.
     - Middle: arch trio, aria-hidden, flex row, items-end, gap 22px, height min(52vh, 500px).
       Three columns with heights 62%, 81%, 100%. Each column: a back arch offset 12px right and 12px up
       (absolute, rounded 999px 999px 0 0) in sky, forest light, lime from left to right, and the photo on
       top (next/image fill, object-cover, same arch radius). Photos signin-arch-1, -2, -3.
       On the third column a lime ring, 58px circle, 4px solid lime border, centred at left 51% top 45%.
       No text on photos. No animation.
     - Bottom: h1 "Every campaign, " + serif italic "in one view." (white), then a muted-on-black line:
       "Plans, pacing, creative and billing for Assembled Media and the brands we work with."
   Right panel: canvas background, centred column max-w 400px, gap 22px.
     - h1 (as h2 visually is fine, one h1 per page: make the left headline a p styled as display if two h1s
       would exist; report which) "Sign in to " + serif italic "AssembledView."
     - Lede: "Use the email your Assembled Media team set up for you."
     - Button default (lime pill) full width: "Log in" -> /auth/login?returnTo=/dashboard (Button asChild Link).
     - Button forest outline full width: "Reset password" ->
       /auth/login?screen_hint=reset_password&returnTo=/dashboard. Use the existing outline variant if it
       renders the forest outline after DS-3a; otherwise the closest existing variant; report.
     - Help row: top hairline, "Need access? Ask your Assembled Media contact." and a "Privacy policy" link.
   Mobile (below md): one column, left panel first with padding 24px 20px, arch trio height 230px, gap 14px.
5. Loading states: new components/brand/BrandLoading.tsx: the dot mark (inline SVG from dot-mark-lime.svg,
   48px) with a gentle opacity pulse disabled under prefers-reduced-motion, and one short line of text
   below. Use it for: app/page.tsx loading ("Loading AssembledView.") and redirect
   ("Taking you to your dashboard."), components/AuthLoadingState.tsx, components/guards/AdminGuard.tsx
   loading state, and any app/**/loading.tsx full-page loader that shows only a spinner or dots (keep
   skeleton-based loading.tsx files as they are). LoadingDots keeps its API; its dots use the primary token.
6. Error pages: app/error.tsx, app/not-found.tsx, app/client/error.tsx: PageHeader-styled title with full
   stop, lede in muted, default Button and outline Button. app/global-error.tsx keeps its own html/body but
   its raw button gets lime pill classes (bg lime, ink text, rounded-pill) using literal BRAND hex only if
   tokens are unavailable there (it renders outside the app CSS); report.
7. /design-system: add a "Brand assets" Section: logo full colour on white, inverted on ink, dot mark,
   favicon, BrandLoading, and a scaled sign-in preview link (a link to "/" is enough; do not embed).
8. Docs: MAP (public/brand, BrandLoading, EntityMark if not already), KNOWN-ISSUES note that the Auth0
   hosted login page is branded separately in the Auth0 dashboard (not code).

STOP conditions for DS-7 (park): any change needed in middleware, auth routes or Auth0 config.
Checks: typecheck, lint, test:brand, test:status, test:session-expiry, test:mba-number-alloc
(clientMenuItems), test:finance-sections (contains lib/nav/__tests__/routeManifest.test.ts), plus every
test touched.
Commit: git commit -m "feat(ui): brand shell, sidebar lime pill, logo, favicon, sign-in page and loading states (DS-7)"
Morning smoke: sign out and view /, sign in, sidebar active and hover in light and dark, collapsed rail,
mobile width bottom nav, favicon in the tab, a 404, the loading state on a hard refresh.

=====================================================================
F. DS-8  PAGE PASSES (D5, D17)
=====================================================================

Goal: every route sits on PageShell, PageHeader and Section, every status colour reads lib/design/status,
no decorative accent bars or tinted icon chips, tables share one look.

Priority order (do in this order, log where you stop):
  1 /dashboard (DashboardOverview), 2 /dashboard/[slug] and /client/[slug] (ClientDashboardPageContent,
  HeroBanner), 3 /dashboard/[slug]/[mba_number] (CampaignPageAssembly, CampaignHeroBanner), 4 /mediaplans,
  /mediaplans/create, /mediaplans/mba/[mba_number]/edit (PlanWizardShell, PlanWizardHeader), plan creative,
  trafficking, ingest, 5 /pacing/* (PacingShell, OverviewClient, OrphansClient, RelabelsClient),
  6 /finance/* (FinanceSectionsShell and section clients, forecast variance page), 7 /client, /publishers,
  /publishers/[publisherId], /creative, /dashboard/[slug]/creative, 8 /scopes-of-work/*, /tasks/*,
  /insights, 9 /account, /profile, /support, /admin/*, 10 /knowledge/*, /tools/behavioural-planner,
  11 /privacy, /data-deletion, /403, /forbidden, /unauthorized.
Route inventory with file:line is in DISCOVERY-design-system-consolidation.md section 1.

Build:
1. Central hero restyle first (one change, many pages): PageHeroTitleBlock (components/dashboard/
   PageHeroShell.tsx:27) uses the PageHeader title typography (28/32/36px extrabold, tracking-tight) and
   withFullStop for page titles. Entity names (campaign, client, publisher, plan names) pass
   punctuate false; report which call sites. PageHeroShell: remove BrandMarkWatermark, keep
   rounded-frame border bg-card, no shadow.
2. Campaign cover (D1): CampaignHeroBanner becomes a black hero band: ink background, white title,
   muted-on-black meta, ClientMark (DS-6), rounded-frame, no border. Status pill keeps StatusPill.
   Text and chip colours inside must be the on-black variants (BRAND.functional *OnBlack, mutedOnBlack).
3. Raw h1 pages (section 1 table: account, profile, support, knowledge/*, admin/*, scopes-of-work create
   and edit, tasks, insights, ingest ParseReviewScreen, pacing overview/orphans/relabels, finance variance,
   error pages if DS-7 did not) move onto PageShell (width standard; reading for legal/knowledge articles;
   narrow for small forms) and PageHeader. Keep any actions in PageHeader actions. Do not change data,
   effects or handlers. Finance: FinanceSectionsShell :50 h1 becomes PageHeader. Pacing: PacingShell title
   "Pacing" becomes PageHeader (full stop). Tasks/insights hand-rolled 26px h1 become PageHeader.
4. Section titles: caps labels used as section headings (for example "CAMPAIGNS & SCOPE DATA", h2/h3 with
   uppercase tracking-wide) become Section titles in sentence case with a full stop. Table headers, nav,
   tabs, buttons and form labels stay unpunctuated (D5).
5. Accent bars and chips (plan observations): remove forest top border bars on the Live campaigns panel and
   campaign cards, primary-gradient stripes (UI-5: DashboardEntityCards :65 :121, AlterBillingDialog :188,
   saving-modal :95, PublisherDetailCharts :203, UnsavedChangesDialog :51; accent-bar.tsx has no importer),
   tinted icon circles on Key metrics tiles (icon becomes plain muted). StatTile and MetricCard keep the
   DS-3b look.
6. UI-3 status debt (358 hits, 119 files): replace direct bg-pacing-* / text-status-* / border-pacing-* /
   pacing-ahead / pacing-on-track class strings with lib/design/status tones (TONE_DOT, TONE_TEXT, the
   badge tone variants, StatusPill) using the same band-to-tone mapping DS-4 put in PACING_UI_STATUS,
   PACING_TILE and KPI_ROW_STATUS. Where a hit's meaning is not a status (for example a decorative tint or
   a success toast) or the mapping is not obvious, leave it and list it. Start with the top 10 files in
   UI-3. Report the new hit count.
7. Tables: tables with only sort, sticky header and CSV move onto components/ui/data-table.tsx
   (candidates: CampaignPacingTable, MediaTable, CreativeAssetTable, EntityBreakdownTable,
   AdGroupBreakdownTable, AllChannelsCompareTable, DirectCampaignsTable, AdServingLineItemTable, the three
   LineItemPacingTable files). Tables with frozen columns, inline edit or grid editing (ExpertGrid,
   EditableFinanceGrid, any LineItemPacingTable that needs frozen client/campaign columns) keep their
   component and adopt the DataTable header and row classes only (export them from data-table.tsx if they
   are not already exported). Behaviour, sort order, CSV columns and sticky offsets must not change.
   STOP for a table (skip it, log it) if its tests fail after the swap.
8. Flat brand utilities (DISCOVERY-brand-05b-ui section 3: bg-brand-dark, bg-highlight, bg-lime, bg-success,
   text-darkGrey, bg-error, and friends) in app/** and components/** become token classes. Report the count
   before and after. Do not delete the Tailwind entries (DS-9).
9. Copy: copyForRowKpiStatus in lib/pacing/kpi/computeKpiStatus.ts returns "KPI pending" (was
   "KPI Pending") for the channel CSV; update its test.
10. Hex: remove literal hex from any app/** or components/** file you touch in this pack (tokens or BRAND).
    Remove cleaned files from the ESLint baseline list.
11. Docs: CONVENTIONS "Every route renders PageShell + PageHeader (or a hero built on PageHeroTitleBlock) and
    Section for headed blocks."; KNOWN-ISSUES update UI-3, UI-5; MAP.

DS-8 may be large. Commit in up to four slices so a later failure does not lose earlier work, each with
explicit paths and the same checks:
  git commit -m "feat(ui): page passes - heroes and dashboards (DS-8a)"
  git commit -m "feat(ui): page passes - plans, pacing and finance (DS-8b)"
  git commit -m "feat(ui): page passes - remaining routes (DS-8c)"
  git commit -m "feat(ui): status debt, tables and flat utilities (DS-8d)"
Checks per slice: typecheck, lint, test:brand, test:status, test:finance-sections, test:pacing-portfolio,
test:pacing-channel, test:pacing-detail, test:campaign-dashboard-range, test:kpi-review,
test:campaign-row-actions, test:plan-drafts, plus every test touched.
Morning smoke: every route group in the priority list in light and dark: title has a full stop (entity names
do not), no coloured top bars, status pills consistent, campaign page black hero band, tables sort and
export CSV as before.

=====================================================================
G. DS-E  EXPORTS FROM THE BRAND SOURCE (D8)
=====================================================================

Layout, maths, rows, columns, pagination, file names and content stay. Only fonts, colours, logo and
rules change. Generators: lib/generateMBA.ts, lib/generateBillingSchedulePDF.ts, lib/generateScopeOfWork.ts
(jsPDF, run in browser and Node), lib/generateMediaPlan.ts and the ExcelJS writers listed in
DISCOVERY-design-system-consolidation.md section 13, and the email templates in lib/email/inviteSender.ts,
lib/creative/uploadDigestEmail.ts, lib/ops/digest/email.ts, lib/ops/health/email.ts,
lib/pacing/relabel/notify.ts (:180), plus any other HTML email builder you find (search "<table" and
"font-family" in lib).

1. PDF fonts:
   - Copy PlusJakartaSans-Regular.ttf, -Bold.ttf, -ExtraBold.ttf and OFL-PlusJakartaSans.txt to
     lib/pdf/fonts/src/.
   - Add scripts/brand/build-pdf-fonts.mjs that reads those TTFs and writes lib/pdf/fonts/plusJakartaSans.ts
     exporting the three base64 strings (generated file header comment: do not edit, regenerate with the
     script). Run it and commit the output.
   - Add lib/pdf/brandPdf.ts: export async function applyBrandFonts(doc) that dynamic-imports
     ./fonts/plusJakartaSans (so client bundles load it only when a PDF is generated), calls
     doc.addFileToVFS and doc.addFont for "PlusJakartaSans" normal, bold and extrabold (as a third style
     name, for example "extrabold"), and sets it as the default. Also export PDF_COLOURS as RGB tuples from
     hexToRgb(BRAND...): ink, body, muted, line, sand, forest, lime.
   - In each PDF generator: call applyBrandFonts once after new jsPDF; replace every
     setFont("helvetica", x) with "PlusJakartaSans" and the matching style; titles that are visibly the
     document title use extrabold; body text colour ink; secondary text muted (replaces 128,128,128);
     setDrawColor(0) rules become line colour for hairlines and ink for the totals rule; table header bands
     (where a header row is drawn) get a sand fill with ink bold text; draft watermark and checksum footer
     keep their position, footer in muted.
   - Logo: '/assembled-logo.png' becomes '/brand/logo-full-colour.png' (same getImageBase64 helper).
     The new logo is 1000x148, so keep the existing width and set height = width * 148 / 1000.
   - Jakarta is wider than Helvetica. Wherever text sits in a fixed-width column without
     splitTextToSize, check it with getTextWidth against the column and wrap or shrink the font by at
     most 1pt; log every place you did this.
   - Server tracing: add the two PDF API routes (app/api/mba/generate, app/api/scopes-of-work/generate-pdf)
     and any other route that renders these PDFs to next.config.mjs outputFileTracingIncludes with
     "./public/brand/**" so the logo is present in the function. Fonts are bundled by import, so they need
     no include. Report the routes you added.
2. Excel (ExcelJS writers): every font name becomes BRAND.font.excel (Aptos) (replace Arial and Calibri);
   grey fills FFF2F2F2 become sand (hexToArgb(BRAND.colour.sand)); FFBFBFBF and other grey borders become
   line; black thin borders become ink; title text ink; any fill painted behind text gets a readable text
   colour via readableTextOn (DS-6) converted to ARGB (fixes white text on lime and context family fills in
   the media plan, for example lib/generateMediaPlan.ts :551-567); the gantt fill FFD02A60 (:527) becomes the
   row's media family colour when the row has a media type, else forest. DRAFT_HEADER_FOOTER keeps its text
   and uses Aptos. No literal ARGB except through hexToArgb(BRAND...).
3. Email: every template uses EMAIL_FONT_STACK (joined) for font-family; outer background sand, content card
   white with rounded corners (8px is fine in email), text ink, secondary muted, rules line; header band ink
   with white "Assembled Media" in bold (no image); buttons lime background, ink text, border-radius 999px,
   padding 12px 22px, bold. Replace #008e5e and the GitHub greys. Keep every link, merge field and text.
4. Sample outputs for the morning smoke: add scripts/brand/render-sample-exports.ts that renders, from
   existing test fixtures where possible (search lib/docs/__tests__, lib/__tests__, lib/billing/__tests__),
   an MBA PDF (normal and draft), a billing schedule PDF, a scope of work PDF, a media plan .xlsx, one finance
   .xlsx, and every email as .html into tmp/overnight-exports/ (tmp/ is gitignored). Run it with tsx. If a
   generator needs inputs that no fixture provides and building one would take more than 20 minutes, skip
   it and log which. Do not stage tmp/.
5. Tests: update expectations that assert Helvetica, Arial, the old logo path, old greys or #008e5e.
   Add lib/pdf/__tests__/brandPdf.test.ts: applyBrandFonts registers the three styles on a jsPDF instance.
6. Docs: INVARIANTS "Exports read lib/brand: PDFs embed Plus Jakarta Sans via lib/pdf/brandPdf.ts; Excel uses
   Aptos and BRAND ARGB; email uses EMAIL_FONT_STACK."; BLAST-RADIUS rows for lib/pdf/brandPdf.ts;
   KNOWN-ISSUES close the retired #008e5e email rows if any.

STOP conditions for DS-E (park the affected generator only, keep the rest): a generator's tests fail on
content (not styling), or text overflow cannot be fixed within 1pt.
Checks: typecheck, lint, test:brand, test:media-plan-excel, test:campaign-documents, test:mba-header-date,
test:mba-scope, test:mba-media-breakdown, test:mba-live-dates, test:finance-sections, test:write-finance,
plus the new test and every test touched.
Commit: git commit -m "feat(exports): brand fonts, colours and logo in PDF, Excel and email (DS-E)"
Morning smoke: open every file in tmp/overnight-exports/, then generate one real MBA PDF and one media plan
Excel from the app.

=====================================================================
H. DS-10  ONE CHART SYSTEM (C-46, C-151)
=====================================================================

Brand chart rules: one highlight colour per chart; context for everything that is not the point; family
colours when the series are media types (D11); pill-ended bars with 2px gaps; little or no gridline;
values labelled in ink (white in dark); one axis; no gradients or shadows; AssembledView runs the same
roles in black mode.

1. Discovery note: every chart in the app (Recharts imports, custom SVG charts, components/charts/system/*,
   delivery charts, MediaPlanVizSection, PublisherDetailCharts, forecasting and finance charts,
   deliveryDailyChartColors.ts, any chart that exports PNG (C-42/C-46)). For each: file, chart type,
   colour source, axis/grid/tooltip config, whether it is a straight swap onto a system component.
2. lib/chart-theme.ts becomes the one chart theme (keep every existing export):
   export function getChartTheme(mode: "light" | "dark") returning hex values only (PNG export safe):
     series (BRAND_SERIES, dark variant below), highlight (forest; forest light in dark), context (context;
     context black in dark), axis text (muted; muted on black), grid (line; line on black), value label
     (ink; white), tooltip { background white | panel, border line | line on black, text ink | white },
     font (CHART_FONT), bar radius (pill), bar gap 2.
   export function familyColourFor(mode, mediaTypeKey): light = familyColour; dark map:
     video forest -> forest light, out_of_home forest light -> forestTextOnBlack, audio muted -> mutedOnBlack,
     print context black -> context, production context -> contextBlack, social and search_display
     unchanged. (Confidence 75%: Luke to confirm in the morning smoke.)
   export function useChartTheme() (client hook) using next-themes resolvedTheme.
   Fix the --chart-1..N variables in app/globals.css and styles/chart-tokens.css so they match BRAND_SERIES
   order in light and the dark variant in .dark; update parity.
3. Restyle components/charts/system/* (bar, composition, flow, line, relation, domain, custom, chart-shell,
   share-breakdown-legend) to read useChartTheme: bars pill-ended (radius half the bar size) with 2px gaps;
   horizontal gridlines only at grid colour, or none on small charts; one axis; axis ticks 11px muted;
   tooltip per theme, no shadow; donut padAngle 2 with rounded ends; lines 2px, no dots except the last
   point; areas flat fill at low opacity (no gradient defs); legend uses dots. Remove literal hex such as
   composition-charts.tsx:205 fill="#fff" (use theme). lib/charts/theme.ts #ccc / #fff attribute-selector
   hooks stay.
4. /design-system "Charts" Section: one example of every type (line, bar, stacked bar, pie/donut, gauge,
   scatter, waterfall, sankey, gantt, heatmap, sparkline) built from the system components with sample data.
   Move app/(internal)/chart-gallery/sample-data.ts to app/(internal)/design-system/chart-samples.ts and
   replace its #008E5E and any other hex with BRAND values. Delete the chart-gallery route and its local Card
   once the Section renders every type.
5. Bespoke charts: for each chart in the discovery note, either swap onto the system component (straight
   swaps only: same type, same data shape, no behaviour change) or keep the component and replace its
   colours, axis, grid, tooltip and font with useChartTheme values. Media-type series use familyColourFor.
   deliveryDailyChartColors.ts reads the theme. Log every chart you kept bespoke and why.
6. PNG export (C-42/C-46): confirm export still paints colours in light and dark (colours are hex from the
   theme). Record the result. Close C-151 if dark-mode series now use the dark variants.
7. Guard: add lib/charts/__tests__/noBespokeChartColours.test.ts that scans components/charts/**,
   components/dashboard/**/charts and every file from the discovery note for #hex, rgb( and hsl( literals,
   allowing only lib/brand, lib/chart-theme.ts and the theme hook. Add it to test:charts-registry.
8. Docs: INVARIANTS "Charts read lib/chart-theme.ts (getChartTheme / useChartTheme). No chart colour
   literals."; KNOWN-ISSUES C-46, C-151; BLAST-RADIUS row for chart theme; MAP.

STOP conditions for DS-10: a chart's data or calculations would need to change (skip that chart, log it).
Checks: typecheck, lint, test:brand, test:charts-registry (with the new guard), test:media-families,
test:campaign-dashboard-range, test:delivery-ui, test:social-delivery, test:programmatic-delivery,
test:search-delivery-tiles, test:finance-forecast, plus every test touched.
Commit: git commit -m "feat(charts): one chart theme, restyled system charts, charts in /design-system (DS-10)"
Morning smoke: /design-system Charts in light and dark, campaign page delivery charts, client dashboard spend
charts, pacing charts, a publisher detail chart, finance forecasting, and one PNG export.

=====================================================================
I. DS-9  RETIRE DEAD CODE AND LEGACY NAMES (runs last)
=====================================================================

Rule: delete only when Select-String across app, components, lib, hooks, contexts, src, scripts, tests,
styles and config finds no reference outside the file itself and its own tests. Use npx knip (already
configured, knip.json) as a second opinion; do not act on knip alone. Delete files with Remove-Item, then
stage the deletions by explicit path.

Candidates (verify each):
  .eslintrc.json (flat config is eslint.config.mjs); styles/globals.css (confirm not imported anywhere);
  components/ui/animated-dot-field.tsx, wave-ribbon.tsx, corner-dot-cluster.tsx, accent-bar.tsx,
  brand-mark-watermark.tsx; lib/brand/brandMarkColours.ts; lib/finance/cardHelpers.ts;
  components/media-containers/ContainerEntryModeToggle.tsx; searchSeriesPalette.cost (searchAdapter.ts:42);
  ChannelCoverageEntry.colour (lib/delivery/channelCoverage.ts:204-220, :570, :598) and its test fixtures;
  ROLE_STYLES (lib/pacing/status.ts); mediaTypeLineItemBadgeStyle and its five unused imports;
  Button variants success and warning (0 Button uses; badge variants stay); Badge customColor and
  ProgressBar customColor props (no callers); .btn-*, .form-*, .alert-*, .dashboard-card, .dashboard-card-flat
  rules in app/globals.css when unused; deprecated brandColour props DS-6 left unused (remove from the
  prop types and every pass-through) when the removal is mechanical; ClientBrandProvider mount in
  app/layout.tsx, components/client-dashboard/ClientBrandProvider.tsx, lib/client-dashboard/theme.ts,
  palette.ts (AV_HOUSE_PALETTE, getChartPalette) and lib/client-dashboard/__tests__/theme.test.ts when
  nothing reads them (then also remove the test:client-dashboard script and its mentions in docs);
  lib/clients/brandColour.ts DEFAULT_CLIENT_BRAND_COLOUR stays (form default);
  publisherColourStripeBackground when unused; tailwind.config.cjs brandPalette flat utilities with zero
  class uses after DS-8 (list any still used);
  public/amlogo.png, public/assembled-logo.png, public/assembled-media-logo.png, public/ferris-wheel.jpg,
  public/white-building.jpg, public/modern-hallway.jpg, public/orange-lighthouse.jpg, public/placeholder-*
  when unreferenced; the old app/icon.svg colours are already replaced in DS-7.
  Any next/font import for a face that is no longer applied (check app/layout.tsx).
Also: remove files from the ESLint baseline list that are now clean or deleted; close UI-7 and any
KNOWN-ISSUES row this resolves; update MAP and BLAST-RADIUS for every removal.

STOP for a candidate (keep it, log it) if removing it breaks typecheck or a test in a way that needs logic
changes.
Checks: typecheck, lint, test:brand, test:status, test:media-families, test:charts-registry,
test:delivery-ui, test:campaign-dashboard-range, test:finance-sections, plus every test touched.
Commit: git commit -m "chore(ui): retire dead design code, legacy palettes and old brand assets (DS-9)"
Morning smoke: app starts clean (no missing-module errors), sign-in page images, sidebar logo, PDFs still
show the logo.

=====================================================================
J. FINAL CHECKS AND REPORT
=====================================================================

1. Run: npm run typecheck, npm run lint, npm run test:all, npm run build. Compare test:all against the A2
   baseline: list any new failure with the pack most likely responsible. Do not try to fix build or test
   failures that need logic changes; log them.
2. Select-String app and components for: bg-gradient, linear-gradient, shadow-, box-shadow, #008e5e,
   Rethink, Helvetica (outside lib/pdf), amlogo, assembled-logo. Record counts and files in RUNLOG.
3. Write the final RUNLOG summary at the top of RUNLOG.md: one line per pack (DONE hash or PARKED),
   new test failures vs baseline (should be none), and a consolidated morning smoke list in route order.
4. Commit the overnight folder (A8). Then STOP. Do not start anything else.
