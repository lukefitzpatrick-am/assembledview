# Plan: Ava's access to data and work tools (23 Nov 2026)

Status: Phase 1 built (pack 19, switch `ava_data_query`, off). Phases 2 and 3 proposed, waiting on Luke.

## How Ava calls tools today

- Ava is an in-app agent on the Anthropic Messages API (`lib/ava/agentLoop.ts`). She has 38 server-side tools in `lib/ava/tools/registry.ts`, offered per page by `pageToolOffer.ts`. Admins only.
- Supabase reads go through `AVA_DATABASE_URL` as `ava_readonly`: read-only transactions, a 5 s timeout, SELECT only on granted tables, `ava_read` RLS.
- Snowflake reads go through the app's own pool inside specific tools (pacing, delivery).
- There's no MCP in Ava yet. Every tool answers one question shape. Anything else is "I can't see that".

## Recommendation in one line

Give Ava one read-only SQL tool over the two stores she already trusts (phase 1, built). Then add hosted MCP servers through the Anthropic MCP connector, one switch each, read tools only (phase 2). Microsoft 365 waits for per-user sign-in (phase 3).

## Phase 1: Supabase and Snowflake (built, pack 19)

**Why not the hosted Supabase and Snowflake MCP servers for Ava:**

- **Supabase MCP:**
  - It authenticates with a personal access token that can manage every project on the account.
  - Its read-only mode uses its own read-only user, which sees every table.
  - That skips the `ava_readonly` allowlist and the `ava_read` policies (internal meeting notes, 0114). It would break an invariant.
- **Snowflake managed MCP:**
  - It's sound. It has a `read_only` SQL tool and role-limited results.
  - It would add four things for the same SQL Ava can run directly: the MCP connector beta, a PAT, a network rule for Anthropic's IP addresses, and Cortex credits.
  - It earns its place later, if you build Cortex Analyst semantic views over MART. It's a good fit for your own Claude (claude.ai, Claude Code) today.

**What pack 19 adds:**

- **Tool `query_data`:**
  - Ava lists tables, then columns, then runs one SELECT or WITH statement.
  - `source` is `supabase` or `snowflake`.
  - At most 200 rows come back, so she aggregates in SQL.
- **The boundary is the database role, not a text scanner:**
  - Supabase runs as `ava_readonly`, which already exists. No migration is needed.
  - Snowflake runs as a new role, `AVA_READONLY`, on its own connection. It has no secondary roles and SELECT on `ASSEMBLEDVIEW.MART` only.
  - The app's own Snowflake role is never used.
- **Rules in the tool text:**
  - Postgres plan money is integer cents.
  - The published version is `published_version_id`.
  - Ava never splits media and fee herself. A raw figure is called raw.
- **Where it's offered:** admins only, never on `/tasks`, and only while the switch `ava_data_query` is on.
- **Size:** about 150 lines of code plus a test file. `lib/snowflake/pool.ts` gains an optional role on one function and two exports. The pool path doesn't change.

**Luke's steps:**

1. Apply pack 19 (`git am`).
2. Run `sql/snowflake/roles/AVA_READONLY.sql` in Snowsight. Fill in the user and warehouse lines from Vercel first.
3. Turn on `ava_data_query` on `/admin/features`.
4. Ask Ava: "List the MART tables", then "Spend by channel last month from MART".

## Phase 2: hosted MCP servers (proposed)

Use the Anthropic MCP connector:

- `mcp_servers` plus an `mcp_toolset` with beta `mcp-client-2025-11-20`.
- Only named read tools are enabled.
- One switch per server, admins only.
- Tokens live as Vercel secrets.

MCP output is outside text, so it counts as captured: the turn is tainted and write tools drop (the F14 rule).

| Source | Official server | Auth | Read-only control | Recommendation |
|---|---|---|---|---|
| GA4 and GSC | BigQuery remote MCP, `bigquery.googleapis.com/mcp` | Google service account (`mcp.toolUser`, `bigquery.jobUser`, `bigquery.dataViewer`) | `execute_sql_readonly`, and deny `execute_sql` by IAM | First, if GA4 and GSC live in BigQuery project `assembledview` (question 1) |
| Google Ads | Google's own server. You deploy it (local or Cloud Run). No shared endpoint. | OAuth client or service account, manager account id | Strict read-only in `tools_config.yaml` | Later. Delivery is already in MART. Live Ads only adds account structure. |
| Meta Ads | Meta-hosted, `mcp.facebook.com/ads` | Not documented on the overview page (under 90%) | No read-only flag documented, so the connector allowlist would be the only guard | Later. Delivery is already in MART, and the server can create and edit campaigns. |
| Fireflies | `api.fireflies.ai/mcp` | API key or OAuth | Not documented | Don't. Fireflies already syncs into `client_notes` every 6 hours, and Ava reads it there with internal meetings excluded (0114). The MCP would bypass that exclusion. |

## Phase 3: Teams and SharePoint (proposed, later)

- Microsoft now points new agents to **Work IQ MCP**: one endpoint, permissions per user. The old per-app Teams and SharePoint servers are not for production.
- It needs per-user Entra sign-in inside Ava, and a Copilot or Agent 365 licence check (under 90%, not confirmed on the overview page).
- Teams and mail text is outside text, so it would be a capture tool: `/tasks` only, and taints the conversation.
- Wait until Work IQ is GA for the tenant and the Codex pilot is through.

## Questions for Luke

1. Do GA4 and GSC now land in BigQuery (`assembledview`), or still in Snowflake (`V_GA4_*`, `V_GSC_*` views)? This decides whether Ava needs BigQuery at all. If it's Snowflake, `query_data` already covers it once the views exist.
2. Which phase 2 server first? The recommendation is BigQuery (if question 1 says so), then none until the pilot ends.
3. Microsoft 365 licences: does the tenant have Copilot or Agent 365 licences for Work IQ?

## Under 90%

- 85%: Snowflake accepts `WITH` inside the `select * from (…)` wrapper. The test can't reach Snowflake. Your first query after the switch confirms it.
- 80%: the app's Snowflake user can open a session with `AVA_READONLY` once it's granted. The SQL's after-check shows the grant, and the first query confirms it.
- Meta Ads MCP auth model and Work IQ licensing: the public pages read did not say.

Sources: Snowflake-managed MCP server docs; Google Ads MCP server guide; BigQuery MCP docs; Fireflies MCP configuration; Meta Ads MCP overview; Microsoft Work IQ MCP overview (all read 23 Nov 2026).
