# Snowflake: AssembledView pacing mart

This document describes how to deploy the pacing mart DDL under `sql/snowflake/pacing/` and validate it. Objects live in database **`ASSEMBLEDVIEW`** (staging **`STG_PACING`**, mart **`MART_PACING`**, consumer views **`VW_PACING`**).

## Prerequisites: roles and grants

Migrations need a **DDL role** (or user) that can create and replace objects in `ASSEMBLEDVIEW`, for example:

- **`USAGE`** on warehouse **`AV_APP_WH`** (or the warehouse you use for DDL).
- **`CREATE SCHEMA`** on database **`ASSEMBLEDVIEW`** (so `STG_PACING`, `MART_PACING`, and `VW_PACING` can be created if they do not exist).
- **`USAGE`** on database **`ASSEMBLEDVIEW`** and on any source database/schema the scripts reference (the migration SQL defines the exact dependencies).
- Ability to **`CREATE`** / **`CREATE DYNAMIC TABLE`** / **`CREATE VIEW`** in the target schemas as required by each script.

The application read path typically uses **`AV_APP_READ_ROLE`**. Initial **`USAGE`** / view grants are usually applied in `00_schemas.sql`. After schema or view changes, re-run **`scripts/snowflake/grant-pacing-read.sql`** so **`AV_APP_READ_ROLE`** keeps **`SELECT`** on:

- `ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING`
- `ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING_DAILY`
- `ASSEMBLEDVIEW.VW_PACING.V_DELIVERY_PACING`
- `ASSEMBLEDVIEW.VW_PACING.V_PACING_ALERTS`

## Environment variables (same as the app)

The runner uses the same variables as `lib/snowflake/pool.ts`:

| Variable | Purpose |
|----------|---------|
| `SNOWFLAKE_ACCOUNT` | Account identifier |
| `SNOWFLAKE_USERNAME` | User name |
| `SNOWFLAKE_ROLE` | Role for DDL (must satisfy prerequisites above) |
| `SNOWFLAKE_WAREHOUSE` | Warehouse (e.g. `AV_APP_WH`) |
| `SNOWFLAKE_DATABASE` | Default database (often `ASSEMBLEDVIEW` or your landing DB) |
| `SNOWFLAKE_SCHEMA` | Default schema (session context; DDL scripts use fully qualified names where needed) |
| Secret | One of: `SNOWFLAKE_PRIVATE_KEY_B64`, `SNOWFLAKE_PRIVATE_KEY_PATH`, or `SNOWFLAKE_PRIVATE_KEY` (JWT auth) |

Optional:

- `SNOWFLAKE_MIGRATION_STATEMENT_TIMEOUT_SECONDS` — session `STATEMENT_TIMEOUT_IN_SECONDS` for the migrate session (default **14400**). Increase for very large initial dynamic table builds.

From the repo root, `.env.local` is loaded automatically if present (same pattern as local app development).

## Running migrations

1. Ensure `sql/snowflake/pacing/*.sql` exists and is committed (files are applied in **lexical** order: `00_…`, `01_…`, …).
2. Preview order without connecting:

   ```bash
   npx tsx scripts/snowflake/run-pacing-migrations.ts --dry-run
   ```

3. Apply:

   ```bash
   npx tsx scripts/snowflake/run-pacing-migrations.ts
   ```

Each file is sent as **one multi-statement request** (semicolon-separated batch). The process **stops on the first failed file** and exits with a non-zero code.

4. (Recommended) Re-apply read grants:

   Run `scripts/snowflake/grant-pacing-read.sql` in Snowflake as a privileged role, or execute it via the same credentials if that role can `GRANT`.

npm shortcut:

```bash
npm run snowflake:migrate:pacing
```

## Verify each layer

Use **`LIMIT 1`** (or `COUNT(*)`) smoke checks. Adjust filters if your environment has no rows yet.

**Staging** — list objects then spot-check:

```sql
SHOW TABLES IN SCHEMA ASSEMBLEDVIEW.STG_PACING;
-- Example once you know table names:
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.<table_name> LIMIT 1;
```

**Mart — regular table:**

```sql
SELECT * FROM ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING LIMIT 1;
```

**Mart — dynamic tables:**

```sql
SELECT * FROM ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY LIMIT 1;
SELECT * FROM ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY LIMIT 1;
```

**Consumer views:**

```sql
SELECT * FROM ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING LIMIT 1;
SELECT * FROM ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING_DAILY LIMIT 1;
SELECT * FROM ASSEMBLEDVIEW.VW_PACING.V_DELIVERY_PACING LIMIT 1;
SELECT * FROM ASSEMBLEDVIEW.VW_PACING.V_PACING_ALERTS LIMIT 1;
```

To confirm dynamic tables are populated and fresh, you can inspect metadata (exact columns depend on Snowflake version):

```sql
SHOW DYNAMIC TABLES IN SCHEMA ASSEMBLEDVIEW.MART_PACING;
```

## Refresh dynamic tables manually

If you need to force a rebuild outside the defined refresh schedule:

```sql
ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY REFRESH;
ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH;
```

Run with a role that **owns** the dynamic table or has the appropriate `OPERATE` / DDL rights. Large refreshes can run for a long time; set a suitable warehouse size and session timeout.

After deploying `suffix_id` match support (`12_alter_dim_plan_mapping_add_code.sql`, `13_update_fact_line_item_pacing_daily_suffix_match.sql`, `14_vw_pacing_v_delivery_pacing.sql`), refresh the line-item fact at minimum:

```sql
ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH;
```

## Verification: `suffix_id` / line item code

Confirm suffix extraction on a known ad group name:

```sql
SELECT
  GROUP_NAME,
  REGEXP_SUBSTR(GROUP_NAME, '[^-]+$') AS extracted_code
FROM ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY
WHERE platform = 'google_ads'
  AND GROUP_TYPE = 'ad_group'
LIMIT 20;
```

Confirm a known mapping resolves in the consumer view (replace the id):

```sql
SELECT * FROM ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING
WHERE AV_LINE_ITEM_ID = '<known av_line_item_id>';
```

## Object summary

| Layer | Objects |
|--------|---------|
| Staging | `ASSEMBLEDVIEW.STG_PACING.*` (entity dimensions and per-platform daily staging) |
| Mart | `ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY` (dynamic table), `ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING` (table), `ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY` (dynamic table) |
| Views | `ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING`, `V_LINE_ITEM_PACING_DAILY`, `V_DELIVERY_PACING`, `V_PACING_ALERTS` |
