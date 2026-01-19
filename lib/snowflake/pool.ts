import "server-only"

import fs from "node:fs"
import snowflake from "snowflake-sdk"

declare global {
  // eslint-disable-next-line no-var
  var __snowflakePool: snowflake.Pool<snowflake.Connection> | undefined
}

const getCachedPool = () => global.__snowflakePool
const setCachedPool = (p: snowflake.Pool<snowflake.Connection>) => {
  global.__snowflakePool = p
}

type SnowflakeEnv = {
  account?: string
  username?: string
  password?: string
  role?: string
  warehouse?: string
  database?: string
  schema?: string
  privateKeyPath?: string
  privateKey?: string
}

const POOL_MAX_CONNECTIONS = 8
const POOL_MIN_CONNECTIONS = 0
const RETRY_MESSAGE = "connection already in progress"
const ACQUIRE_TIMEOUT_MS = 60000
const EXECUTE_TIMEOUT_MS = 55000
const INIT_TIMEOUT_MS = 8000
const BASE_BACKOFF_MS = 250
const MAX_RETRIES = 4

const STATEMENT_TIMEOUT_IN_SECONDS = 60
const QUERY_TAG = "assembledview_pacing"
const INIT = Symbol.for("sf_init")
const DEBUG_SNOWFLAKE = process.env.NEXT_PUBLIC_DEBUG_SNOWFLAKE === "true"

function getEnv(): SnowflakeEnv {
  return {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
    privateKey: process.env.SNOWFLAKE_PRIVATE_KEY,
  }
}

function readPrivateKey(env: SnowflakeEnv): string | null {
  const { privateKeyPath, privateKey } = env

  if (privateKeyPath && fs.existsSync(privateKeyPath)) {
    return fs.readFileSync(privateKeyPath, "utf8")
  }

  if (privateKey) {
    return privateKey.replace(/\\n/g, "\n")
  }

  return null
}

function ensureConfig(env: SnowflakeEnv) {
  const required = ["account", "username", "role", "warehouse", "database", "schema"] as const
  const missing = required.filter((key) => !env[key])

  if (missing.length) {
    throw new Error(`Missing Snowflake env vars: ${missing.join(", ")}`)
  }

  const hasPassword = Boolean(env.password)
  const hasPrivateKey = Boolean(readPrivateKey(env))

  if (!hasPassword && !hasPrivateKey) {
    throw new Error(
      "Missing Snowflake credentials: provide SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY(_PATH)"
    )
  }
}

function getPool(): snowflake.Pool<snowflake.Connection> {
  const cached = getCachedPool()
  if (cached) return cached

  const env = getEnv()
  ensureConfig(env)

  const privateKey = readPrivateKey(env)
  const credentials = privateKey
    ? { authenticator: "SNOWFLAKE_JWT", privateKey }
    : { password: env.password! }

  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production"

  const poolOptions: snowflake.PoolOptions & { acquireTimeoutMillis?: number } = {
    max: POOL_MAX_CONNECTIONS,
    min: isProd ? 1 : POOL_MIN_CONNECTIONS,
    acquireTimeoutMillis: ACQUIRE_TIMEOUT_MS,
  }

  const createdPool = snowflake.createPool(
    {
      account: env.account!,
      username: env.username!,
      role: env.role!,
      warehouse: env.warehouse!,
      database: env.database!,
      schema: env.schema!,
      ...credentials,
      clientSessionKeepAlive: true,
    },
    poolOptions
  )

  setCachedPool(createdPool)
  return createdPool
}

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err
  if (typeof err === "object" && err !== null) {
    const maybe = (err as { message?: string }).message
    if (typeof maybe === "string") return maybe
  }
  return "Unknown Snowflake error"
}

function formatError(err: unknown): Error {
  const message = getErrorMessage(err)
  const prefixed = message.startsWith("[snowflake]") ? message : `[snowflake] ${message}`
  return new Error(prefixed)
}

function shouldRetry(err: unknown): boolean {
  const message = getErrorMessage(err)

  const lowerMessage = message.toLowerCase()
  const upperMessage = message.toUpperCase()
  const transientTokens = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]

  return (
    lowerMessage.includes(RETRY_MESSAGE) ||
    lowerMessage.includes("acquire timeout") ||
    transientTokens.some((token) => upperMessage.includes(token))
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function destroyConnection(connection: snowflake.Connection) {
  try {
    connection.destroy((err) => {
      if (err) {
        console.warn("[snowflake] failed to destroy connection", err)
      }
    })
  } catch (err) {
    console.warn("[snowflake] failed to destroy connection", err)
  }
}

async function acquireConnection(): Promise<snowflake.Connection> {
  const activePool = getPool() as unknown as {
    acquire: (cb: (err: unknown, connection?: snowflake.Connection) => void) => void
  }

  return new Promise((resolve, reject) => {
    activePool.acquire((err, connection) => {
      if (err) return reject(err)
      if (!connection)
        return reject(new Error("[snowflake] Failed to acquire Snowflake connection from pool"))
      resolve(connection)
    })
  })
}

function releaseConnection(connection: snowflake.Connection) {
  const activePool = getPool() as unknown as { release: (conn: snowflake.Connection) => void }
  try {
    activePool.release(connection)
  } catch (err) {
    console.warn("[snowflake] failed to release connection", err)
  }
}

async function executeWithTimeout<T = any>(
  connection: snowflake.Connection,
  sqlText: string,
  binds: any[] = [],
  timeoutMs: number = EXECUTE_TIMEOUT_MS,
  label: string = "query"
): Promise<T[]> {
  let stmt: snowflake.RowStatement | null = null
  let finished = false
  let timeoutId: NodeJS.Timeout

  const wrapError = (message: string) => {
    const trimmed = sqlText.slice(0, 60).replace(/\s+/g, " ").trim()
    return new Error(`[snowflake] ${message}: ${trimmed}`)
  }

  const promise = new Promise<T[]>((resolve, reject) => {
    const resolveOnce = (rows: T[] = [] as T[]) => {
      if (finished) return
      finished = true
      clearTimeout(timeoutId)
      resolve(rows)
    }
    const rejectOnce = (err: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timeoutId)
      reject(err)
    }

    stmt = connection.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          rejectOnce(err)
        } else {
          resolveOnce((rows ?? []) as T[])
        }
      },
    })

    timeoutId = setTimeout(() => {
      const timeoutError = wrapError("timeout executing")
      let cancelTimeoutId: NodeJS.Timeout | null = setTimeout(() => {
        cancelTimeoutId = null
        rejectOnce(timeoutError)
      }, 2000)

      try {
        stmt?.cancel(() => {
          if (cancelTimeoutId) {
            clearTimeout(cancelTimeoutId)
            cancelTimeoutId = null
          }
          rejectOnce(timeoutError)
        })
      } catch {
        rejectOnce(timeoutError)
      }
    }, timeoutMs)
  })

  const start = DEBUG_SNOWFLAKE ? Date.now() : null
  const result = await promise
  if (DEBUG_SNOWFLAKE && start !== null) {
    console.info("[snowflake][timing]", { label, ms: Date.now() - start })
  }
  return result
}

async function initSession(connection: snowflake.Connection) {
  const marker = INIT as unknown as keyof typeof connection
  if ((connection as any)[marker]) return

  await executeWithTimeout(connection, `ALTER SESSION SET TIMEZONE = 'Australia/Melbourne';`, [], INIT_TIMEOUT_MS, "init:timezone")
  await executeWithTimeout(
    connection,
    `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${STATEMENT_TIMEOUT_IN_SECONDS};`,
    [],
    INIT_TIMEOUT_MS,
    "init:statement_timeout"
  )
  await executeWithTimeout(
    connection,
    `ALTER SESSION SET QUERY_TAG = '${QUERY_TAG}';`,
    [],
    INIT_TIMEOUT_MS,
    "init:query_tag"
  )

  ;(connection as any)[marker] = true
}

export async function execWithRetry<T = any>(sqlText: string, binds: any[] = []): Promise<T[]> {
  let attempt = 0

  while (true) {
    let connection: snowflake.Connection | null = null
    let destroyAfterRelease = false
    try {
      const acquireStart = DEBUG_SNOWFLAKE ? Date.now() : null
      connection = await acquireConnection()
      if (DEBUG_SNOWFLAKE && acquireStart !== null) {
        console.info("[snowflake][timing]", { label: "acquire", ms: Date.now() - acquireStart })
      }

      const initStart = DEBUG_SNOWFLAKE ? Date.now() : null
      await initSession(connection)
      if (DEBUG_SNOWFLAKE && initStart !== null) {
        console.info("[snowflake][timing]", { label: "initSession", ms: Date.now() - initStart })
      }

      const queryStart = DEBUG_SNOWFLAKE ? Date.now() : null
      const result = await executeWithTimeout<T>(connection, sqlText, binds, EXECUTE_TIMEOUT_MS, "query")
      if (DEBUG_SNOWFLAKE && queryStart !== null) {
        console.info("[snowflake][timing]", { label: "query", ms: Date.now() - queryStart })
      }
      return result
    } catch (err) {
      if (connection) {
        destroyAfterRelease = true
        console.debug("[snowflake] marking connection for destroyAfterRelease", {
          attempt,
          error: getErrorMessage(err),
        })
      }

      const canRetry = shouldRetry(err) && attempt < MAX_RETRIES
      if (!canRetry) {
        throw formatError(err)
      }

      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt)
      attempt += 1
      await delay(backoff)
    } finally {
      if (connection) {
        try {
          releaseConnection(connection)
        } catch (e) {
          console.error("[snowflake] releaseConnection failed", e)
        }
        if (destroyAfterRelease) {
          try {
            destroyConnection(connection)
          } catch (e) {
            console.error("[snowflake] destroyConnection failed", e)
          }
        }
      }
    }
  }
}
