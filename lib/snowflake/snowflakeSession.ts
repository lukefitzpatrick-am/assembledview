import "server-only"

import fs from "node:fs"
import snowflake from "snowflake-sdk"

type SnowflakeEnv = {
  account?: string
  username?: string
  role?: string
  warehouse?: string
  database?: string
  schema?: string
  privateKeyPath?: string
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
    "Snowflake private key missing. Set SNOWFLAKE_PRIVATE_KEY_B64 or SNOWFLAKE_PRIVATE_KEY_PATH."
  )
}

function validateEnv(env: SnowflakeEnv): void {
  const required = ["account", "username", "role", "warehouse", "database", "schema"] as const
  const missing = required.filter((k) => !env[k])
  if (missing.length) {
    throw new Error(
      `[snowflakeSession] Missing: ${missing.map((k) => `SNOWFLAKE_${k.toUpperCase()}`).join(", ")}`
    )
  }
  readPrivateKey(env)
}

function connect(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()))
  })
}

function destroy(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve) => {
    connection.destroy(() => resolve())
  })
}

/**
 * One-off JWT connection (not the request pool). Use for multi-statement transactions.
 */
export async function withSnowflakeSession<T>(fn: (connection: snowflake.Connection) => Promise<T>): Promise<T> {
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
    return await fn(connection)
  } finally {
    await destroy(connection)
  }
}

export function sessionExecuteVoid(
  connection: snowflake.Connection,
  sqlText: string,
  binds: unknown[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds: binds as snowflake.Binds,
      parameters: { MULTI_STATEMENT_COUNT: 0 },
      complete: (err) => (err ? reject(err) : resolve()),
    })
  })
}

export function sessionExecuteRows<T = Record<string, unknown>>(
  connection: snowflake.Connection,
  sqlText: string,
  binds: unknown[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds: binds as snowflake.Binds,
      parameters: { MULTI_STATEMENT_COUNT: 0 },
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])),
    })
  })
}
