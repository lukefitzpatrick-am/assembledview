/**
 * Applies SQL migrations under sql/snowflake/pacing/*.sql in lexical order.
 * Connection env matches lib/snowflake/pool.ts (JWT via private key; no server-only import).
 *
 * Usage:
 *   npx tsx scripts/snowflake/run-pacing-migrations.ts
 *   npx tsx scripts/snowflake/run-pacing-migrations.ts --dry-run
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import snowflake from "snowflake-sdk"

const REPO_ROOT = process.cwd()
const MIGRATIONS_DIR = path.join(REPO_ROOT, "sql", "snowflake", "pacing")

type SnowflakeEnv = {
  account?: string
  username?: string
  role?: string
  warehouse?: string
  database?: string
  schema?: string
  privateKeyPath?: string
}

function loadEnvLocal(): void {
  const p = path.join(REPO_ROOT, ".env.local")
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val
    }
  }
}

function getEnv(): SnowflakeEnv {
  return {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
  }
}

function readPrivateKey(env: SnowflakeEnv): string {
  const b64 = process.env.SNOWFLAKE_PRIVATE_KEY_B64?.trim()
  if (b64) {
    return Buffer.from(b64, "base64")
      .toString("utf8")
      .replace(/\r\n/g, "\n")
      .trim()
  }

  if (env.privateKeyPath && fs.existsSync(env.privateKeyPath)) {
    return fs.readFileSync(env.privateKeyPath, "utf8")
      .replace(/\r\n/g, "\n")
      .trim()
  }

  throw new Error(
    "Snowflake private key missing. Set SNOWFLAKE_PRIVATE_KEY_B64 (Vercel) or SNOWFLAKE_PRIVATE_KEY_PATH (local)."
  )
}

function validateEnv(env: SnowflakeEnv): void {
  const required = ["account", "username", "role", "warehouse", "database", "schema"] as const
  const missing = required.filter((k) => !env[k])
  if (missing.length) {
    throw new Error(
      `[pacing-migrate] Missing: ${missing.map((k) => `SNOWFLAKE_${k.toUpperCase()}`).join(", ")}`
    )
  }
  readPrivateKey(env)
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      `[pacing-migrate] Directory not found: ${MIGRATIONS_DIR}\nCreate it and add *.sql migrations.`
    )
  }
  const names = fs.readdirSync(MIGRATIONS_DIR)
  return names
    .filter((n) => n.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
}

function connect(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.connect((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function destroy(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve) => {
    connection.destroy(() => resolve())
  })
}

/**
 * Execute one or more semicolon-separated statements. Uses MULTI_STATEMENT_COUNT = 0 (matches Snowflake Node driver docs).
 * Drains multi-statement result chains via hasNext / NextResult.
 */
function executeMultiStatement(
  connection: snowflake.Connection,
  sqlText: string,
  parameters?: Record<string, string | number>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onComplete = (err: unknown, stmt: snowflake.RowStatement) => {
      if (err) {
        reject(err)
        return
      }
      try {
        const rowStmt = stmt as snowflake.RowStatement & {
          hasNext?: () => boolean
          NextResult?: () => void
        }
        if (typeof rowStmt?.hasNext === "function" && rowStmt.hasNext()) {
          rowStmt.NextResult?.()
        } else {
          resolve()
        }
      } catch (e) {
        reject(e)
      }
    }

    connection.execute({
      sqlText,
      parameters: parameters ?? { MULTI_STATEMENT_COUNT: 0 },
      complete: onComplete,
    })
  })
}

async function main(): Promise<void> {
  loadEnvLocal()
  const dryRun = process.argv.includes("--dry-run")
  const files = listMigrationFiles()

  if (files.length === 0) {
    console.info(`[pacing-migrate] No .sql files in ${MIGRATIONS_DIR}`)
    if (dryRun) {
      console.info("[pacing-migrate] Dry run — nothing to execute.")
      return
    }
    process.exitCode = 1
    return
  }

  console.info(`[pacing-migrate] Files (${files.length}):`)
  for (const f of files) {
    console.info(`  ${f}`)
  }

  if (dryRun) {
    console.info("[pacing-migrate] Dry run — not connecting.")
    return
  }

  const env = getEnv()
  validateEnv(env)
  const privateKey = readPrivateKey(env)

  const connection = snowflake.createConnection({
    account: env.account!,
    username: env.username!,
    role: env.role!,
    warehouse: env.warehouse!,
    database: env.database!,
    schema: env.schema!,
    authenticator: "SNOWFLAKE_JWT",
    privateKey,
    clientSessionKeepAlive: false,
  })

  await connect(connection)

  try {
    const timeoutSec =
      Number(process.env.SNOWFLAKE_MIGRATION_STATEMENT_TIMEOUT_SECONDS ?? "14400") || 14400
    await executeMultiStatement(
      connection,
      `ALTER SESSION SET TIMEZONE = 'Australia/Melbourne';
ALTER SESSION SET MULTI_STATEMENT_COUNT = 0;
ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${timeoutSec};`,
      { MULTI_STATEMENT_COUNT: 0 }
    )

    for (const file of files) {
      const full = path.join(MIGRATIONS_DIR, file)
      const sqlText = fs.readFileSync(full, "utf8")
      process.stdout.write(`[pacing-migrate] Running ${file} ... `)
      const start = Date.now()
      try {
        await executeMultiStatement(connection, sqlText, { MULTI_STATEMENT_COUNT: 0 })
        console.info(`ok (${Date.now() - start} ms)`)
      } catch (e) {
        console.info(`FAIL (${Date.now() - start} ms)`)
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[pacing-migrate] ${file}: ${msg}`)
        process.exitCode = 1
        return
      }
    }
    console.info("[pacing-migrate] All migrations applied.")
  } finally {
    await destroy(connection)
  }
}

main().catch((e) => {
  console.error("[pacing-migrate] Fatal:", e instanceof Error ? e.message : e)
  process.exitCode = 1
})
