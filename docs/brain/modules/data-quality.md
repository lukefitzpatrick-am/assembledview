# Module: Data quality queue (S17)

One queue of data problems the app's checks find. Each item names the plan (MBA), the line, the rule broken and a link to the fix, and is assigned to the plan owner. Decision S17 A (Luke, 17 Nov 2026). Stage 1 (S17 batch) built the table, the one writer, two sources, the screen and the digest section. Discovery: `notes-B60-builder.md`, refreshed in `notes-S17-builder.md`.

## Switch and data

- Switch `data_quality_queue` (Admin > Features, owner Luke), off. `requiresMarker: "0123_data_quality_items"`: off and can't be turned on until migration 0123 runs. Off: nothing is read or written, `/data-quality` is not found, both routes answer 404, the digest has no section and its email is byte for byte as before. Stored items stay.
- Table `data_quality_items` (0123, RLS on, no policies, no ava grant). See `DATA-MODEL.md`. One open row per rule, plan and line: partial unique index `data_quality_items_open_key` on `(rule_key, mba_number, coalesce(line_item_id, ''))` WHERE `status = 'open'`.
- Statuses: `open`, `resolved` (`resolved_by` is the actor's email, or `check`), `dismissed` (a reason, 1 to 1000 characters, enforced by a check constraint).

## The one writer (`lib/dataQuality/items.server.ts`)

- `recordFindings(ruleKeys, findings, db?)`: the only way a check writes. Null when the switch is off.
  1. Resolves the owner of every plan named (`resolvePlanOwners`, one query).
  2. Upserts each finding (`upsertDataQualityItem`): a new open item, or the open one updated (`last_seen_at`, message, fix, owner, client). `first_seen_at` never moves. A dismissed item with the same key blocks the write: dismissed stays dismissed.
  3. Resolves, per rule key the check covers, every open item it did not find (`resolveMissingItems`, `resolved_by = 'check'`).
- A dismissed key blocks for good, even after the plan is republished and breaks again (as briefed; Luke's Q4 asks whether a new published version should reopen it).
- A check must pass its complete result. A sample or a failed read must not call it: it would resolve live problems.
- A problem resolved by hand that a check still finds opens a new item (the resolved row stays as history).
- `listOpenDataQualityItems` and `closeDataQualityItem` serve the screen. Close works only on an open item.

## Plan owner (B60 Q1, built as option A)

There is no owner field. The owner is resolved when an item is written:
1. the client's finance owner (`client_finance_owners.team_member_id`, an active team member), else
2. the published version's last publisher (`media_plan_versions.published_by` matched, case-insensitively on both sides, to an active team member's primary email), else
3. unassigned (null). Luke's overdue view shows unassigned items.

Live (24 Nov 2026): 217 published plans; 177 have a finance owner, 55 a publisher stamp, 28 neither.

## Sources (stage 1, B60 Q2 built as option A)

Both run once a day from `/api/cron/relabel-drift` (`15 21 * * *` UTC, 07:15 Melbourne), after the drift check, through `runDataQualitySweep` (`lib/dataQuality/sources.server.ts`). The sweep is one transaction under `pg_advisory_xact_lock(hashtext('data_quality_sweep'))`: a second sweep waits for the first to commit, then reads afresh, so it never resolves an item the other has just found again. The cron's own answer (401, summary, 500 body) is unchanged whether the sweep is off, on or throws.

| Rule key | Source | Item per | Fix link |
|---|---|---|---|
| `publish.no_publisher`, `publish.burst_end_before_start`, `publish.bursts_overlap`, `publish.burst_outside_plan_dates`, `publish.plan_dates_reversed`, `publish.package_no_quantity` | `validatePlanForPublish` refusals (S1) on every published version (`media_plan_masters.published_version_id`), one query | rule, plan and line (`plan_dates_reversed` has no line); burst messages joined | `/mediaplans/mba/<mba>/edit` |
| `relabel.drift` | the drift report the cron just computed: drift findings only (an applied relabel whose map row is missing or points elsewhere). Legacy map rows are not problems | plan and target line | Relabels log, `?tab=log&mba=<mba>&id=<relabel id>` |

- A failed drift check passes null: relabel items are left as they are, publish items still run.
- Plans of test and internal clients (`clients.is_test_client`, 0112) are skipped, as the finance checks skip them. Live (24 Nov 2026): about 135 real-client items on the first run; 594 no-publisher lines on 5 test-client plans are left out.
- The publish source runs whether or not `publish_validation` is on. That switch decides whether publish refuses; the plan pages list the same problems either way, and the brief's source is the problems on published versions. The queue is the list to clear before it goes on (Luke's Q2).
- The B34 Snowflake checks (CM360 drift, label map duplicates) are not sources: they read a 10-row sample and group out the plan. Stage 2.
- Rule labels and the overdue rule live in `lib/dataQuality/rules.ts` (pure). A new check adds its keys there.

## Screen and routes

- `/data-quality` (`app/data-quality/page.tsx`, `components/dataQuality/DataQualityClient.tsx`). Admin only (the one staff role, and the one unscoped role); a client, or an admin viewing as a client, is sent to `/unauthorized`. In the route manifest, not in the palette or sidebar yet.
- Filters: owner (all, Mine, unassigned, each person), rule, client, Overdue only. The ops list (`getOpsEmailRecipients`, Luke by default) opens on every owner's overdue items; everyone else opens on their own (Mine). Overdue items come first, oldest first within each group.
- Each row: plan and client, line, rule and message, owner, days open with Overdue, the fix link, Resolve (asks first in the shared `Dialog`), Dismiss (the shared `Dialog`, reason on the field through `useFieldErrors`). Results go through `announce()`.
- `GET /api/data-quality` (open items), `PATCH /api/data-quality/[id]` (`{ action: "resolve" }` or `{ action: "dismiss", reason }`). Both `requireRole(["admin"])`, then the switch.
- Overdue: open more than 3 whole days (`OVERDUE_AFTER_DAYS`; a rule may set its own `overdueDays`).
- shortcut: the list is not paged (about 135 open items live, test clients skipped). Page in SQL past a few thousand.

## Digest

The pacing digest (`30 22 * * 1,4` UTC, Tue and Fri 09:30 AEDT; schedule unchanged; it goes to the ops list, Luke) gets a Data quality section with the switch on. It shows overdue counts only: the overdue total, then each owner with overdue items (unassigned is one) and their overdue count, most overdue first, and a link to `/data-quality` on `APP_BASE_URL` (none when unset). Owners get no email of their own; whether they should is Luke's Q1. With the switch off the email is byte for byte as before and the `data_checks` stage log line has no `dataQuality` key. `loadDigestDataQuality` sits beside the B34 and S5 loaders under the same 45 s deadline; a failed read says "not available" and the digest still sends.

## Tests

`lib/dataQuality/__tests__` (`dataQuality.db` on a local Postgres via `DATA_QUALITY_TEST_DATABASE_URL`, a `*_dq_test` database; `rules.s17`; `switchOff.s17`), `lib/ops/digest/__tests__/dataQuality.s17` and `dataChecks.b34`, `app/api/cron/relabel-drift/__tests__/route.s17`, `app/api/data-quality/__tests__/routes.s17`, `app/data-quality/__tests__/page.s17`, `components/dataQuality/__tests__/DataQualityClient.s17` (Vitest).
