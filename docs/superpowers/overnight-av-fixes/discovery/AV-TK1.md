# AV-TK1 — portfolio Postgres reads, 11 Oct 21:18 UTC

Status: discovery, then a fail-fast on the portfolio reads. No write path holds a transaction across network I/O.

Times are 2026-10-11 UTC. The syd1 `GET /api/pacing/portfolio` started at 21:18:08. Six `line_items` statements were cancelled at 21:24:03.

## 1. Where statement_timeout is set

**The app does not set it. The live session cap is 2 minutes, from the Postgres configuration file. That does not cancel a statement that started at 21:18:08. It cancels a statement that started about 21:22:03. 95% on the setting. 90% that 21:24:03 is that 2-minute timer.**

Searched the repo for `statement_timeout`, `lock_timeout`, `SET LOCAL`, and `set_config`. The only Postgres setters are:

- `db/migrations/0003_ava_readonly.sql` sets `statement_timeout = '5s'` on role `ava_readonly`. That role is `db/avaClient.ts`, not the app pool.
- `lib/snowflake/pool.ts` sets Snowflake `STATEMENT_TIMEOUT_IN_SECONDS`. That is not Postgres.

`db/index.ts` opens `postgres(DATABASE_URL, { prepare: false, max: 10 })`. No `connection` options, no `idle_timeout`, no statement timeout. `DATABASE_URL` is the transaction pooler (port 6543) and its query string has no `options` and no timeout parameter.

A read-only session on that URL, 12 Oct 2026:

| Setting | Effective | Source |
|---|---|---|
| `statement_timeout` | 120000 ms (2min) | configuration file |
| `lock_timeout` | 0 | default |
| `idle_in_transaction_session_timeout` | 0 | default |
| `idle_session_timeout` | 0 | default |

`pg_roles.rolconfig` for `postgres` is only `search_path`. It does not set `statement_timeout`. `anon` is 3s, `authenticated` and `authenticator` are 8s, `ava_readonly` is 5s. Supabase's own docs describe this: the `postgres` role is unset and the global cap is 2 minutes. This session matches that.

`app/api/pacing/portfolio/route.ts` exports `maxDuration = 300`. 21:18:08 plus 300s is 21:23:08, 55s before the cancel. The function cap is not the message "canceling statement due to statement timeout".

21:18:08 to 21:24:03 is 355s. A statement that began when the backend session began would have been cancelled at about 21:20:08. Session start on a Supavisor server connection is when that backend process started (the pool for this request came up at 21:18:08, after the earlier pool had shut down idle at 21:11:03). It is not `query_start`. A statement that began at about 21:22:03 hits a 2-minute `statement_timeout` at 21:24:03.

`pg_stat_statements` for query id `-8156914066826520313` (queried the same day): 30,735 calls, mean 0.703 ms, max 71.674 ms. Completed runs of this statement are not slow. The cancel was during command tag `PARSE`. postgres.js sends `Parse` as the first message of an unnamed extended query (`node_modules/postgres/src/connection.js`, `unnamed`). Parse is where Postgres takes `AccessShareLock` on `line_items`. A wait there for the whole timeout leaves command tag `PARSE` and does not move the `pg_stat_statements` max, because the statement never finishes executing.

What would raise the 90% to a query_start: the log line's `query_start` next to `session_start`. They were not in the evidence supplied.

## 2. Which path issues this select

**Search, social, programmatic, and ad serving. Not the direct source. Not the versions source. Not inside a transaction. The shared `getDb()` client. 95%.**

The normalised statement is:

```sql
select "id", "created_at", "version_id", "channel", "line_item_id", "position", "market", "buying_demo", "buy_type", "publisher", "platform", "bid_strategy", "fixed_cost_media", "client_pays_for_media", "budget_includes_fees", "no_adserving", "bursts", "attrs"
from "line_items"
where ("line_items"."version_id" = $1 and "line_items"."channel" = $2)
```

Column order is `db/schema/planCore.ts` `lineItems`. That is `db.select().from(schema.lineItems).where(versionId and channel)` in `fetchLineItemsFromPostgres` (`lib/data/readMediaPlans.ts`). `labelPlanQuery` prefixes `/* av:readChannelLineItems */`. `pg_stat_statements` drops the comment. No other statement in the repo selects this column list with this where.

Portfolio build (`buildCampaignPacingRows.ts`) runs five channel sources and the versions source in one `Promise.all`.

| Source | Postgres it runs | This `line_items` select |
|---|---|---|
| direct | `readPacingMasters`, then `readPacingVersions` (`fetchDirectPacingRows.ts` 269–284). Snowflake facts before and after. | No |
| versions | `readPublishedOrLivePlanVersions` (`media_plan_versions` only) | No |
| search | `readPlanMasters`, `readPlanVersionsForMbas`, then `fetchLineItemsFromPostgresByEndpoint` at concurrency 8 (`fetchSearchPacingCampaignRows.ts` 93–127) | Yes |
| programmatic, social, ad serving | `resolveLivePlanLineItems` → the same masters, versions, and `fetchLineItemsFromPostgresByEndpoint` at concurrency 8 | Yes |

Each of those selects is autocommit on `getDb()` (`db/index.ts`). None is wrapped in `db.transaction`.

Six cancels at one timestamp fits a few of those in-flight parses sharing the 2-minute timer. The pool max is 10, and the other sources are also checking out connections.

## 3. Write paths to `line_items`

**One runtime writer: `savePlanVersion`. It does not wait on the network inside the transaction. A user can call it at any time, including 21:00–21:24 UTC. Nothing scheduled at 21:00 writes `line_items`. 93%.**

| Path | What it does | Transaction across network I/O | Around 21:00–21:24 UTC |
|---|---|---|---|
| `lib/data/savePlan.ts` `savePlanVersion` (816–1324) | `DELETE` then `INSERT` `line_items` for one `version_id`, plus version, schedule, fee, and publish stamps. Called by `POST /api/plans/save` for draft, publish, and new version. Strip-empty-lines runs in memory in that route before this call. | No. Blob documents and `markRunItemsStaleOnPublish` run after the transaction returns (1332–1354). | User-triggered. No cron. |
| `lib/mediaplan/reapUnpublishedStagedVersions.ts` | `DELETE` `media_plan_versions`; `line_items.version_id` cascades. Each delete is its own autocommit. | No. | No callers. The function is defined and not imported. |
| `scripts/cutover/03-postgres-delete-krusty.sql` | Manual `DELETE FROM line_items`. | A script, not the app. | Not a cron. |
| `/api/cron/xano-line-item-sync` (19:00 UTC) | `fetchAllPgLineItems` reads `line_items` (different statement: a join, `line_item_id` before `channel`). Writes Snowflake `MART.XANO_LINE_ITEMS_SNAPSHOT`. | The read is not in a transaction with the warehouse write. | 19:00, not this window. |
| Relabel apply / revert, relabel-drift cron `15 21 * * *` | Reads `line_items` through `publishedLine.ts` (a join, different column list). Writes Snowflake and `delivery_relabels`. | Snowflake transaction is not a Postgres transaction. | Drift cron is inside the window. It does not write `line_items`. |
| Finance, ingest panels, billing overrides, Codex, reports | Transactions on other tables. | No network inside those callbacks. See §4. | Finance crons are 19:00, 20:00, 00:15–01:00, 12:59/13:59. Not 21:00. |

`INSERT` / `UPDATE` / `DELETE` of `line_items` in application code is only `savePlan.ts`. A `RowExclusiveLock` from that `DELETE`/`INSERT` does not conflict with the `AccessShareLock` this `SELECT` takes. An open save does not, by itself, stall this parse.

## 4. Lock held across network I/O

**No `db.transaction` or `sql.begin` awaits network I/O. 92%.**

Reviewed every `db.transaction` and `pg.begin` callback (`savePlan`, billing overrides, billing schedule, finance approve / unapprove / send-to-accounts, `writeFinance`, xero queue, xero contact links, xero match, ingest panels, column remap, campaign read, campaign insights, report-run claim, uploaded-audience retain, draft-match stamps, the service-fee backfill, and `xs3-vault-to-blob`). `lib/codex/repo.ts` has many transactions and no `fetch`, Snowflake, or HTTP call. `xs3-vault-to-blob.ts` downloads the blob before `writeColumn`'s transaction, which is only an update.

The line-items writer is the one that could have blocked readers, and it does not leave the transaction for network. Nothing else in these callbacks takes a lock and then awaits a socket.

There is still no identified holder of the lock that would stall `PARSE` for two minutes. `AccessExclusiveLock` (DDL, `TRUNCATE`, `VACUUM FULL`, non-concurrent `REINDEX` / `CREATE INDEX`) is the mode that blocks this `SELECT`. The app does not issue that against `line_items`.

Next time a portfolio read hits `55P03` or `57014`, capture one row per blocked backend and its blockers:

```sql
select a.pid, a.xact_start, a.query_start, a.state, a.wait_event_type, a.wait_event,
       a.query, pg_blocking_pids(a.pid) as blockers
from pg_stat_activity a
where a.state <> 'idle';
```

Plus `pg_locks` for those pids (`locktype`, `mode`, `granted`, `relation::regclass`). `query_start` against `session_start` is the check that separates a 2-minute statement from a 6-minute-old backend.

## 5. Pool slot after withDeadline

**Yes. A `postgres` client with `max: 10` waits forever for a pool slot. `withDeadline` does not free the slot. The query keeps running until the server finishes it, which today means the 2-minute `statement_timeout`. 95%.**

`postgres` 3.4.9 `handler` (`node_modules/postgres/src/index.js` 329–341) pushes the query onto `queries` when every connection is busy and no closed slot is left to open. Nothing times that queue out. `idle_timeout` defaults to null; this app does not set it. `connect_timeout` (30s) applies only while the socket is connecting. `max_pipeline` is 100, so one connection can hold a pipeline, but a statement that has not returned occupies that connection until the server answers.

`withDeadline` (`loadPortfolioChannelSources.ts` 92–108) rejects its own promise on a timer. It does not call `query.cancel` and it does not end the client. The postgres.js query stays on the connection. The slot stays checked out.

`discardHungPostgresClient` (`db/index.ts` 70–79) calls `client.end({ timeout: 0 })`, which races `destroy` → `terminate` → `socket.end`. That is a Terminate message, not the cancel protocol (`connection.js` `cancel` at 145–154, which is a separate connection). The versions retry calls it (`buildCampaignPacingRows.ts` 69–74). The direct retry does not. Queries still sitting in the `queries` array are rejected with `CONNECTION_DESTROYED` only when `destroy` runs. A statement already in `PARSE` on the server keeps running until `statement_timeout` or the server notices the socket close. The 21:02:34 Supavisor line "Client socket closed while state was idle" is an idle backend, which matches a client that closed without a statement running on that server connection.

The 90s source deadline therefore gives up in JavaScript while the first Postgres read can still hold a pool slot until the 2-minute server cap. The retry in the same invocation can queue behind that slot.

## Part B gate

No transaction-held lock across network I/O. Part B is a 5s `lock_timeout` and 15s `statement_timeout` on the portfolio masters, versions, and line-item reads, so a stuck read returns while the 90s retry can still run. Snowflake SQL, the warehouse, and the 90s deadline stay as they are. Confidence this is safe on a healthy read: the completed `line_items` statement maxes at 72 ms, and 15s is the existing server cap's failure mode brought inside one invocation. 93%.
