# UX workflow review and in-app help (23 Nov 2026)

Status: review done; HELP1 built (switch `in_app_help`, off). Findings 1 to 12 open, each waiting on the build or decision named in its row.

Reviewed against the pending release (files 01 to 78 applied to HF1, tree `6d89c6c7`), not live HF1. Judged against Google's web.dev guidance: Core Web Vitals (LCP, INP, CLS), accessible patterns (toggletips, focus management, names for controls), and loading and error states. Read only: no app was run against live data, so every finding comes from the code and the brain.

## 1. Journeys mapped

| Journey | Who | Entry | Steps today | Biggest friction |
|---|---|---|---|---|
| Create a plan | Planner | Campaigns, Create Campaign | Setup, Channels, MBA & billing, Review & files, Publish | Primary button changes meaning (finding 1) |
| Edit and republish | Planner | Campaigns, open a plan | Edit working copy, Save draft or Publish | Edit shows 2 of the 4 step headings (finding 4) |
| Load a publisher schedule | Planner | Schedule ingest or AVA | Upload, Parse review, load into form, publish | Two entry points, neither named on the plan page |
| Expert grid | Planner | Inside a channel | Edit grid, Apply | C-342 fee loss is live until pack 14 (finding 3) |
| Finance month | Finance owner | Clients billing | Scope, To bill, Approve, Send, In Xero, Owed | In Xero, Owed and True-up are not in the sidebar (finding 6) |
| True-up | Finance | Clients billing, Reports | Review gaps, fix schedule or explain | Fine once found; hard to find |
| Pacing | Account manager | Pacing | Portfolio, tab, campaign, scenario | Every tab refetches on mount (P-8) |
| Relabel delivery | Account manager | Admin, Relabels | Match, preview, apply, revert | Lives under Admin though it fixes pacing |
| Client dashboard | Client | Their dashboard | Where we are, channels, creative | No help at all before HELP1 |
| Codex | Everyone | Admin, Codex | List, project board, proposals | Daily tool filed under muted Admin (finding 6) |
| AVA | Admin | Bottom right | Ask, load into form | Admin only; no hint of what it can do |

## 2. What already works well

- Skip link, one live-region announcer (B58), field-level errors (B58), one dialog system with focus return (B57), Ctrl K palette with a shortcut sheet.
- `EmptyState` is used in 157 places. Icon-only buttons checked by hand all have names.
- The plan wizard rail with a running summary is the right shape.

## 3. Findings, ranked

| # | Finding | Evidence | Guidance | Fix | Owner |
|---|---|---|---|---|---|
| 1 | The plan's primary button reads Publish, Save draft or Save depending on switch and state. On create, Save draft is always disabled and the reason is only in a hover title. | `lib/mediaplan/planWizardSaveBar.ts:88`, `CREATE_SAVE_DRAFT_DISABLED_REASON` | A control's label should not change meaning; a disabled control needs a visible reason | One Publish button always labelled Publish. Save draft separate. On create, replace the dead Save draft with the autosave line "Saved in this browser". Question H3 | Plan form thread (S33) |
| 2 | 40 disabled controls in 15 files explain themselves only in `title` | Scan of Button, SplitActionButton and DropdownMenuItem with `disabled` and `title` | `title` is not shown on touch or to most keyboard users | One rule: a disabled control's reason is visible text tied by `aria-describedby`. Build as HELP2 | This thread |
| 3 | Expert grid Apply removes fee on fee-inclusive lines (C-342), and nothing on screen warns | KNOWN-ISSUES C-342, pack 10 note | Prevent errors at the point of action | Apply packs 1 to 14. No interim UI | Luke |
| 4 | Edit shows Step 01 and Step 04 headings; create shows all four. The rail lists four on both | `create/page.tsx:7022`, `:7081` vs edit | Consistent wayfinding | Comes free with the plan form merge | Plan form thread (S33) |
| 5 | Channel names differ by screen ("Prog Audio", "Digi Display", "Newspapers" vs billing names) | `create/page.tsx` container labels | Consistent naming | V19 A | Luke (V19) |
| 6 | Navigation: Codex, Clients, Publishers and Relabels sit in the muted Admin group. In Xero, Owed and True-up have no sidebar entry. `/finance/invoicing` is "Clients billing" in the sidebar and "To bill" on its tab. "Publishers" is both the directory and finance costs. Finance section descriptions show internal codes (PC6, FP-6, `schedule_months`) | `lib/nav/routeManifest.ts:113`, `lib/finance/sections/nav.ts` | Information scent | A Work group (Codex, Clients, Publishers, Relabels); one label per route; plain descriptions. Question H5 | This thread, HELP3 |
| 7 | 4 `loading.tsx` and 2 `error.tsx` for 92 pages | `find app -name loading.tsx` | Skeletons protect LCP and CLS; a section error should not drop the whole shell | `loading.tsx` and `error.tsx` per section (finance, mediaplans, tasks, admin) using `LoadingState` and `ErrorState` | HELP3 |
| 8 | No Core Web Vitals measurement | No `useReportWebVitals`, no Speed Insights | You cannot manage INP or LCP without field data | `useReportWebVitals` to the existing logs, no new dependency. Question H4 | HELP3 |
| 9 | INP risk on the plan pages: create holds 198 `useState`, edit 250, in one component each | `grep -c useState` | INP under 200 ms | Measure first (finding 8), then split state by step during S33 | Plan form thread |
| 10 | Pacing tabs refetch on every mount | KNOWN-ISSUES P-8 | Fast navigation | Already logged | Next pacing batch |
| 11 | No help in the app. Support is a login email. The glossary has MBA but not AA, true-up, relabel or fixed cost | `app/support/page.tsx`, `src/data/learning/terms.json` | Help where the task is | HELP1 (built). Add AV terms to the glossary in HELP2 | This thread |
| 12 | Finance `InfoTip` is a hover tooltip (7 uses) | `components/finance/sections/InfoTip.tsx` | Toggletip, not tooltip, for content a user needs | Point `InfoTip` at `HelpTip` in HELP2 (click to open instead of hover) | This thread |

## 4. In-app help: what HELP1 builds

Luke chose both inline tips and a side panel.

- **Switch** `in_app_help`, off by default, admin toggles, sent to the browser. Clients see it on their dashboards when on.
- **One content file** `lib/help/topics.ts`. A topic per route from the route manifest; a page without one uses its nearest parent's. 23 topics cover plans, finance, pacing, relabels, dashboards, Codex, clients, publishers, scopes, features and the Knowledge Hub.
- **Help button** in the top bar, beside Search. Opens a right-hand sheet: summary, numbered steps, "Good to know", links. Focus returns to Help on close.
- **Show me.** A step tied to part of the page scrolls there and moves focus there. The plan pages use the four wizard step ids.
- **`?` tips.** `HelpTip` is a click toggletip (Popover), keyboard and touch friendly, named "Help: <label>". Placed on Unallocated and beside Save or Publish in the plan bottom bar, and on the finance scope line.
- **User guide.** `docs/handbook/06-user-guide.md`, the long form of the same content.
- **Not touched:** the twin plan pages, channel containers, the expert grid and AVA, which other work is changing now.

Skipped: a `?` keyboard shortcut (the palette already uses `?`), guided overlays that dim the page, per-user "seen" state, analytics on help use. None was asked for.

Lean: -0 lines possible. HELP1 adds about 230 lines of content and 120 of component.

## 5. Questions for Luke

| # | Question | Recommended |
|---|---|---|
| H1 | Who keeps help current? | A: the batch that changes a page updates its topic in the same commit (now in BLAST-RADIUS) |
| H2 | Show Help to clients? | A: yes; client topics are written for clients (built this way) |
| H3 | Plan button rule (finding 1) | A: Publish always says Publish; Save draft is separate; create shows "Saved in this browser" instead of a dead button |
| H4 | Web Vitals data (finding 8) | A: `useReportWebVitals` into our logs, no new dependency. B: Vercel Speed Insights (a new package and a Vercel setting) |
| H5 | Navigation (finding 6) | A: new Work group with Codex, Clients, Publishers, Relabels; Admin keeps only admin tools |

## 6. Under 90%

- 85%: the journey friction in section 1 is from code and the brain, not from watching people use the app. Ten minutes with two planners and one finance owner on HELP1 would confirm it.
- 80%: finding 9 is a risk, not a measurement. Finding 8 gives the number.
- 85%: the help copy for Codex and Parse review describes the default views; the Codex pilot switches change some screens.
