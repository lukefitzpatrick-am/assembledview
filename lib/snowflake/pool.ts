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

// =============================================================================
// POOL CONFIGURATION
// All timeouts are configurable via environment variables for tuning per environment
// =============================================================================

// Track whether we're in a serverless/production environment (skip warming)
const IS_PRODUCTION = (process.env.NODE_ENV || "").toLowerCase() === "production"

// Maximum connections in the pool
// Increased to 20 to handle concurrent pacing requests without exhaustion
// In serverless, connections are ephemeral so higher max is safe
const POOL_MAX = Number(process.env.SNOWFLAKE_POOL_MAX ?? "20")

// Minimum connections to maintain (always 0 for serverless to avoid stale connections)
const POOL_MIN_CONNECTIONS = 0

// Number of connections to pre-create during pool warming
// 3 connections provides good coverage for typical concurrent load
const POOL_WARM_SIZE = Number(process.env.SNOWFLAKE_POOL_WARM_SIZE ?? (IS_PRODUCTION ? "0" : "3"))

// Timeout for each connection during pool warming (10 seconds)
// Shorter than regular acquire to fail fast during warmup
const POOL_WARM_TIMEOUT_MS = Number(process.env.SNOWFLAKE_POOL_WARM_TIMEOUT_MS ?? "10000")

// =============================================================================
// TIMEOUT CONFIGURATION
// Tuned to prevent timeout cascades while allowing adequate time for operations
// =============================================================================

// Connection acquisition timeout
// Production defaults to 7s (fail fast under Vercel limits); dev stays at 15s
const DEFAULT_ACQUIRE_TIMEOUT_MS = IS_PRODUCTION ? "7000" : "15000"
const ACQUIRE_TIMEOUT_MS = Number(process.env.SNOWFLAKE_ACQUIRE_TIMEOUT_MS ?? DEFAULT_ACQUIRE_TIMEOUT_MS)

// Query execution timeout
// Production defaults to 8s; dev stays at 30s for heavier local queries
const DEFAULT_EXECUTE_TIMEOUT_MS = IS_PRODUCTION ? "8000" : "30000"
const EXECUTE_TIMEOUT_MS = Number(process.env.SNOWFLAKE_EXECUTE_TIMEOUT_MS ?? DEFAULT_EXECUTE_TIMEOUT_MS)

// Session initialization timeout: 8 seconds
// Rationale: ALTER SESSION commands are fast; 8s is generous
// If init takes longer, the connection is likely unhealthy
const DEFAULT_INIT_TIMEOUT_MS = "8000"
const INIT_TIMEOUT_MS = Number(process.env.SNOWFLAKE_INIT_TIMEOUT_MS ?? DEFAULT_INIT_TIMEOUT_MS)

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

// Base backoff for retries (exponential: 250ms, 500ms, 1000ms, ...)
const BASE_BACKOFF_MS = 250

// Maximum backoff time to prevent extremely long waits (10 seconds)
const MAX_BACKOFF_MS = 10000

// Maximum retry attempts for transient errors
// Production defaults to 1; dev allows more retries
const MAX_RETRIES = Number(process.env.SNOWFLAKE_MAX_RETRIES ?? (IS_PRODUCTION ? "1" : "3"))

// Maximum total time for all retry attempts
// Production defaults to 12s; dev allows up to 120s
const DEFAULT_MAX_TOTAL_RETRY_TIME_MS = IS_PRODUCTION ? "12000" : "120000"
const MAX_TOTAL_RETRY_TIME_MS = Number(
  process.env.SNOWFLAKE_MAX_RETRY_TIME_MS ?? DEFAULT_MAX_TOTAL_RETRY_TIME_MS
)

// Error tokens that indicate transient network errors (safe to retry)
const TRANSIENT_ERROR_TOKENS = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED"]

// Error tokens that indicate authentication/authorization errors (never retry)
const AUTH_ERROR_TOKENS = [
  "INVALID_CREDENTIALS",
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "INVALID_JWT",
  "JWT_TOKEN_EXPIRED",
  "OAUTH",
  "401",
  "403",
]

// Error message indicating a connection attempt is already in progress
const RETRY_MESSAGE = "connection already in progress"

// =============================================================================
// CIRCUIT BREAKER CONFIGURATION
// Prevents hammering Snowflake when it's experiencing issues
// =============================================================================

// Number of consecutive failures before opening the circuit
const CIRCUIT_BREAKER_THRESHOLD = 5

// How long to keep the circuit open before allowing a test request (30 seconds)
const CIRCUIT_BREAKER_RESET_MS = 30000

// Circuit breaker state (module-level singleton)
interface CircuitBreakerState {
  consecutiveFailures: number
  lastFailureTime: number | null
  isOpen: boolean
  openedAt: number | null
}

const circuitBreaker: CircuitBreakerState = {
  consecutiveFailures: 0,
  lastFailureTime: null,
  isOpen: false,
  openedAt: null,
}

/**
 * Record a successful request - resets the circuit breaker
 */
function recordSuccess(): void {
  if (circuitBreaker.consecutiveFailures > 0 || circuitBreaker.isOpen) {
    console.info("[snowflake][circuit] Circuit breaker reset after success", {
      previousFailures: circuitBreaker.consecutiveFailures,
      wasOpen: circuitBreaker.isOpen,
    })
  }
  circuitBreaker.consecutiveFailures = 0
  circuitBreaker.lastFailureTime = null
  circuitBreaker.isOpen = false
  circuitBreaker.openedAt = null
}

/**
 * Record a failed request - may open the circuit breaker
 */
function recordFailure(): void {
  circuitBreaker.consecutiveFailures += 1
  circuitBreaker.lastFailureTime = Date.now()

  if (circuitBreaker.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitBreaker.isOpen) {
    circuitBreaker.isOpen = true
    circuitBreaker.openedAt = Date.now()
    console.error("[snowflake][circuit] Circuit breaker OPENED", {
      consecutiveFailures: circuitBreaker.consecutiveFailures,
      resetAfterMs: CIRCUIT_BREAKER_RESET_MS,
    })
  }
}

/**
 * Check if the circuit breaker allows a request to proceed
 * @returns true if request should proceed, false if circuit is open
 */
function isCircuitClosed(): boolean {
  if (!circuitBreaker.isOpen) {
    return true
  }

  // Check if enough time has passed to allow a test request
  const timeSinceOpen = Date.now() - (circuitBreaker.openedAt ?? 0)
  if (timeSinceOpen >= CIRCUIT_BREAKER_RESET_MS) {
    console.info("[snowflake][circuit] Circuit breaker allowing test request", {
      timeSinceOpenMs: timeSinceOpen,
      consecutiveFailures: circuitBreaker.consecutiveFailures,
    })
    return true // Allow a test request through
  }

  return false
}

/**
 * Get current circuit breaker status for monitoring
 */
export function getCircuitBreakerStatus(): {
  isOpen: boolean
  consecutiveFailures: number
  timeSinceOpenMs: number | null
  timeUntilResetMs: number | null
} {
  const timeSinceOpen = circuitBreaker.openedAt ? Date.now() - circuitBreaker.openedAt : null
  const timeUntilReset = timeSinceOpen !== null 
    ? Math.max(0, CIRCUIT_BREAKER_RESET_MS - timeSinceOpen)
    : null

  return {
    isOpen: circuitBreaker.isOpen,
    consecutiveFailures: circuitBreaker.consecutiveFailures,
    timeSinceOpenMs: timeSinceOpen,
    timeUntilResetMs: timeUntilReset,
  }
}

const STATEMENT_TIMEOUT_IN_SECONDS = 60
const QUERY_TAG = "assembledview_pacing"
const INIT = Symbol.for("sf_init")
const DEBUG_SNOWFLAKE = process.env.NEXT_PUBLIC_DEBUG_SNOWFLAKE === "true"

// Track whether pool warming has been initiated (ensures warming only starts once)
let warmInitiated = false
// Track whether pool warming has completed successfully
let poolWarmed = false
// Track whether warming is currently in progress (prevents concurrent warming attempts)
let warmingInProgress = false
// Allow forcing pool warming even in production via env var
const FORCE_POOL_WARM = process.env.SNOWFLAKE_FORCE_POOL_WARM === "true"

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

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================

/** Validation limits for pool and timeout settings */
const VALIDATION_LIMITS = {
  POOL_MAX: { min: 1, max: 50 },
  TIMEOUT_MS: { min: 5000, max: 120000 },
  WARM_SIZE: { min: 0, max: 10 },
} as const

/** Track which settings came from environment vs defaults */
interface ConfigSource {
  value: number | string
  source: "env" | "default"
}

/**
 * Get configuration value with source tracking
 */
function getConfigWithSource(
  envVar: string | undefined,
  defaultValue: string
): ConfigSource {
  if (envVar !== undefined && envVar !== "") {
    return { value: envVar, source: "env" }
  }
  return { value: defaultValue, source: "default" }
}

/**
 * Validate a numeric configuration value is within acceptable range
 */
function validateNumericRange(
  name: string,
  value: number,
  min: number,
  max: number
): void {
  if (isNaN(value)) {
    throw new Error(`[snowflake] Invalid ${name}: must be a number, got NaN`)
  }
  if (value < min || value > max) {
    throw new Error(
      `[snowflake] Invalid ${name}: must be between ${min} and ${max}, got ${value}`
    )
  }
}

/**
 * Mask sensitive values for logging (show first/last 2 chars)
 */
function maskSensitive(value: string | undefined, showChars: number = 2): string {
  if (!value) return "(not set)"
  if (value.length <= showChars * 2) return "***"
  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`
}

/**
 * Validate all Snowflake configuration settings.
 * 
 * Checks:
 * - All required environment variables are present
 * - POOL_MAX is between 1-50
 * - All timeout values are between 5000-120000ms
 * - Either password or private key is provided
 * 
 * @throws Error with descriptive message if validation fails
 */
function validateSnowflakeConfig(env: SnowflakeEnv): void {
  // Check required environment variables
  const required = ["account", "username", "role", "warehouse", "database", "schema"] as const
  const missing = required.filter((key) => !env[key])

  if (missing.length) {
    throw new Error(
      `[snowflake] Missing required environment variables: ${missing.map(k => `SNOWFLAKE_${k.toUpperCase()}`).join(", ")}`
    )
  }

  // Check credentials (private key required for JWT auth)
  readPrivateKey(env)

  // Validate POOL_MAX
  validateNumericRange(
    "SNOWFLAKE_POOL_MAX",
    POOL_MAX,
    VALIDATION_LIMITS.POOL_MAX.min,
    VALIDATION_LIMITS.POOL_MAX.max
  )

  // Validate POOL_WARM_SIZE
  validateNumericRange(
    "SNOWFLAKE_POOL_WARM_SIZE",
    POOL_WARM_SIZE,
    VALIDATION_LIMITS.WARM_SIZE.min,
    VALIDATION_LIMITS.WARM_SIZE.max
  )

  // Validate timeout settings
  const timeouts = [
    { name: "SNOWFLAKE_ACQUIRE_TIMEOUT_MS", value: ACQUIRE_TIMEOUT_MS },
    { name: "SNOWFLAKE_EXECUTE_TIMEOUT_MS", value: EXECUTE_TIMEOUT_MS },
    { name: "SNOWFLAKE_INIT_TIMEOUT_MS", value: INIT_TIMEOUT_MS },
    { name: "SNOWFLAKE_POOL_WARM_TIMEOUT_MS", value: POOL_WARM_TIMEOUT_MS },
  ]

  for (const { name, value } of timeouts) {
    validateNumericRange(
      name,
      value,
      VALIDATION_LIMITS.TIMEOUT_MS.min,
      VALIDATION_LIMITS.TIMEOUT_MS.max
    )
  }
}

/**
 * Log the pool configuration for debugging.
 * Only logs in development mode or when DEBUG_SNOWFLAKE is enabled.
 * Masks sensitive values like passwords and private keys.
 * 
 * @param env - The Snowflake environment configuration
 */
function logPoolConfiguration(env: SnowflakeEnv): void {
  // Only log in development or when debug is enabled
  if (IS_PRODUCTION && !DEBUG_SNOWFLAKE) {
    return
  }

  // Track which values came from env vs defaults
  const poolMaxSource = getConfigWithSource(process.env.SNOWFLAKE_POOL_MAX, "20")
  const acquireTimeoutSource = getConfigWithSource(process.env.SNOWFLAKE_ACQUIRE_TIMEOUT_MS, DEFAULT_ACQUIRE_TIMEOUT_MS)
  const executeTimeoutSource = getConfigWithSource(process.env.SNOWFLAKE_EXECUTE_TIMEOUT_MS, DEFAULT_EXECUTE_TIMEOUT_MS)
  const initTimeoutSource = getConfigWithSource(process.env.SNOWFLAKE_INIT_TIMEOUT_MS, DEFAULT_INIT_TIMEOUT_MS)
  const warmSizeSource = getConfigWithSource(process.env.SNOWFLAKE_POOL_WARM_SIZE, IS_PRODUCTION ? "0" : "3")
  const warmTimeoutSource = getConfigWithSource(process.env.SNOWFLAKE_POOL_WARM_TIMEOUT_MS, "10000")

  // Determine credential type
  const privateKey = readPrivateKey(env)
  const credentialType = privateKey
    ? `JWT (private key${env.privateKeyPath ? " from file" : " from env"})`
    : "Password"

  // Format source indicator
  const formatSource = (s: ConfigSource) => `${s.value} (${s.source})`

  console.info("[snowflake] Pool configuration:", {
    // Pool settings
    pool: {
      max: formatSource(poolMaxSource),
      min: POOL_MIN_CONNECTIONS,
      warmSize: formatSource(warmSizeSource),
    },
    // Timeout settings
    timeouts: {
      acquireMs: formatSource(acquireTimeoutSource),
      executeMs: formatSource(executeTimeoutSource),
      initMs: formatSource(initTimeoutSource),
      warmMs: formatSource(warmTimeoutSource),
    },
    // Retry settings
    retry: {
      maxRetries: MAX_RETRIES,
      maxTotalTimeMs: MAX_TOTAL_RETRY_TIME_MS,
      baseBackoffMs: BASE_BACKOFF_MS,
      maxBackoffMs: MAX_BACKOFF_MS,
    },
    // Circuit breaker
    circuitBreaker: {
      threshold: CIRCUIT_BREAKER_THRESHOLD,
      resetMs: CIRCUIT_BREAKER_RESET_MS,
    },
    // Connection settings (masked)
    connection: {
      account: env.account,
      username: env.username,
      role: env.role,
      warehouse: env.warehouse,
      database: env.database,
      schema: env.schema,
      credentials: credentialType,
    },
    // Environment
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "(not set)",
      isProduction: IS_PRODUCTION,
      debugEnabled: DEBUG_SNOWFLAKE,
      forcePoolWarm: FORCE_POOL_WARM,
    },
  })
}

/**
 * Get a summary of the current pool configuration.
 * Useful for health check endpoints and debugging.
 */
export function getPoolConfiguration(): {
  pool: { max: number; min: number; warmSize: number }
  timeouts: { acquireMs: number; executeMs: number; initMs: number }
  retry: { maxRetries: number; maxTotalTimeMs: number }
  circuitBreaker: { threshold: number; resetMs: number }
  connection: { account: string; warehouse: string; database: string; schema: string }
} {
  const env = getEnv()
  return {
    pool: {
      max: POOL_MAX,
      min: POOL_MIN_CONNECTIONS,
      warmSize: POOL_WARM_SIZE,
    },
    timeouts: {
      acquireMs: ACQUIRE_TIMEOUT_MS,
      executeMs: EXECUTE_TIMEOUT_MS,
      initMs: INIT_TIMEOUT_MS,
    },
    retry: {
      maxRetries: MAX_RETRIES,
      maxTotalTimeMs: MAX_TOTAL_RETRY_TIME_MS,
    },
    circuitBreaker: {
      threshold: CIRCUIT_BREAKER_THRESHOLD,
      resetMs: CIRCUIT_BREAKER_RESET_MS,
    },
    connection: {
      account: env.account ?? "",
      warehouse: env.warehouse ?? "",
      database: env.database ?? "",
      schema: env.schema ?? "",
    },
  }
}

/** Pool statistics for monitoring */
export interface PoolStats {
  /** Whether pool has been initialized */
  initialized: boolean
  /** Maximum connections allowed */
  max: number
  /** Minimum connections to maintain */
  min: number
  /** Number of connections currently in use */
  active: number
  /** Number of idle connections available */
  idle: number
  /** Number of requests waiting for a connection */
  pending: number
  /** Total connections created since pool init */
  totalCreated: number
  /** Whether pool warming has been initiated */
  warmed: boolean
  /** Circuit breaker status */
  circuitBreaker: {
    isOpen: boolean
    consecutiveFailures: number
    timeUntilResetMs: number | null
  }
}

/**
 * Get current pool statistics for monitoring and debugging.
 * 
 * This function provides real-time insight into pool state:
 * - Active vs idle connections
 * - Pending requests waiting for connections
 * - Circuit breaker status
 * 
 * Only provides detailed stats in development mode.
 * In production, returns basic info without pool internals.
 * 
 * @returns PoolStats object with current pool state
 */
export function getPoolStats(): PoolStats {
  const cachedPool = getCachedPool()
  const cbStatus = getCircuitBreakerStatus()

  // Base stats when pool not initialized
  if (!cachedPool) {
    return {
      initialized: false,
      max: POOL_MAX,
      min: POOL_MIN_CONNECTIONS,
      active: 0,
      idle: 0,
      pending: 0,
      totalCreated: 0,
      warmed: poolWarmed,
      circuitBreaker: {
        isOpen: cbStatus.isOpen,
        consecutiveFailures: cbStatus.consecutiveFailures,
        timeUntilResetMs: cbStatus.timeUntilResetMs,
      },
    }
  }

  // Try to access pool internals (generic-pool exposes these)
  // The snowflake SDK uses generic-pool under the hood
  const pool = cachedPool as unknown as {
    size?: number
    available?: number
    borrowed?: number
    pending?: number
    spareResourceCapacity?: number
    _count?: number
    _availableObjects?: { length: number }
    _inUseObjects?: Set<unknown> | { size: number }
    _waitingClientsQueue?: { length: number } | { size: number }
  }

  // Extract stats from pool internals (varies by generic-pool version)
  let active = 0
  let idle = 0
  let pending = 0
  let totalCreated = 0

  // Try different property names used by different versions
  if (typeof pool.borrowed === "number") {
    active = pool.borrowed
  } else if (pool._inUseObjects) {
    active = "size" in pool._inUseObjects ? pool._inUseObjects.size : 0
  }

  if (typeof pool.available === "number") {
    idle = pool.available
  } else if (pool._availableObjects) {
    idle = pool._availableObjects.length
  }

  if (typeof pool.pending === "number") {
    pending = pool.pending
  } else if (pool._waitingClientsQueue) {
    pending = "length" in pool._waitingClientsQueue 
      ? pool._waitingClientsQueue.length 
      : ("size" in pool._waitingClientsQueue ? pool._waitingClientsQueue.size : 0)
  }

  if (typeof pool.size === "number") {
    totalCreated = pool.size
  } else if (typeof pool._count === "number") {
    totalCreated = pool._count
  } else {
    totalCreated = active + idle
  }

  return {
    initialized: true,
    max: POOL_MAX,
    min: POOL_MIN_CONNECTIONS,
    active,
    idle,
    pending,
    totalCreated,
    warmed: poolWarmed,
    circuitBreaker: {
      isOpen: cbStatus.isOpen,
      consecutiveFailures: cbStatus.consecutiveFailures,
      timeUntilResetMs: cbStatus.timeUntilResetMs,
    },
  }
}

/**
 * Log current pool statistics for debugging.
 * Only logs in development mode or when DEBUG_SNOWFLAKE is enabled.
 * 
 * Can be called from anywhere to get a snapshot of pool state.
 * Useful for debugging connection issues.
 * 
 * @example
 * // In a page or API route
 * import { logPoolStats } from "@/lib/snowflake/pool"
 * logPoolStats() // Logs stats to console
 */
export function logPoolStats(): void {
  // Only log in development or when debug is enabled
  if (IS_PRODUCTION && !DEBUG_SNOWFLAKE) {
    return
  }

  const stats = getPoolStats()

  console.info("[snowflake][stats] Pool statistics:", {
    status: stats.initialized ? "INITIALIZED" : "NOT_INITIALIZED",
    connections: {
      active: stats.active,
      idle: stats.idle,
      pending: stats.pending,
      total: stats.totalCreated,
      max: stats.max,
      utilization: stats.max > 0 ? `${Math.round((stats.active / stats.max) * 100)}%` : "N/A",
    },
    warmed: stats.warmed,
    circuitBreaker: stats.circuitBreaker.isOpen
      ? {
          status: "OPEN",
          consecutiveFailures: stats.circuitBreaker.consecutiveFailures,
          resetInMs: stats.circuitBreaker.timeUntilResetMs,
        }
      : {
          status: "CLOSED",
          consecutiveFailures: stats.circuitBreaker.consecutiveFailures,
        },
  })
}

function getPool(): snowflake.Pool<snowflake.Connection> {
  const cached = getCachedPool()
  if (cached) return cached

  const env = getEnv()

  // Validate all configuration before creating the pool
  // This will throw descriptive errors if configuration is invalid
  validateSnowflakeConfig(env)

  // Log configuration for debugging (only in development or when debug enabled)
  logPoolConfiguration(env)

  const privateKey = readPrivateKey(env)
  const credentials = {
    authenticator: "SNOWFLAKE_JWT",
    privateKey,
  }

  const poolOptions: snowflake.PoolOptions & { acquireTimeoutMillis?: number } = {
    max: POOL_MAX,
    // Always keep min at 0 to avoid stale serverless connections.
    min: POOL_MIN_CONNECTIONS,
    acquireTimeoutMillis: ACQUIRE_TIMEOUT_MS,
  }

  console.info("[snowflake] Creating connection pool", {
    account: env.account,
    warehouse: env.warehouse,
    poolMax: POOL_MAX,
  })

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

  // Trigger non-blocking pool warming after pool creation
  // Only warm in development (not production/serverless) unless explicitly forced
  // This prevents cold-start delays on first query
  if (!warmInitiated && (!IS_PRODUCTION || FORCE_POOL_WARM)) {
    warmInitiated = true
    console.info("[snowflake] Initiating async pool warming", {
      isProduction: IS_PRODUCTION,
      forceWarm: FORCE_POOL_WARM,
    })

    // Don't await - let warming happen in background (non-blocking)
    // Use .catch() to ensure warming failures don't propagate
    warmPool().catch((err) => {
      // Graceful degradation: log error but don't throw
      console.error("[snowflake] Pool warming failed (non-fatal)", {
        error: getErrorMessage(err),
      })
    })
  }

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

/**
 * Determine if an error is retriable based on error type.
 * 
 * Retriable errors:
 * - ECONNRESET, ETIMEDOUT, EAI_AGAIN, ENOTFOUND, ECONNREFUSED (network issues)
 * - "connection already in progress" (concurrent connection attempt)
 * 
 * Non-retriable errors:
 * - Authentication/authorization errors (wrong credentials, expired JWT)
 * - Acquire timeouts (pool exhaustion - retrying won't help)
 * - Query syntax errors
 * - Permission errors
 * 
 * @param err - The error to check
 * @param attempt - Current attempt number (0-based)
 * @returns true if the error is retriable
 */
function shouldRetry(err: unknown, attempt: number = 0): boolean {
  const message = getErrorMessage(err)
  const lowerMessage = message.toLowerCase()
  const upperMessage = message.toUpperCase()

  // NEVER retry authentication/authorization errors
  // These won't resolve themselves and indicate misconfiguration
  const isAuthError = AUTH_ERROR_TOKENS.some((token) => 
    upperMessage.includes(token) || lowerMessage.includes(token.toLowerCase())
  )
  if (isAuthError) {
    console.debug("[snowflake] Not retrying auth error", { message, attempt })
    return false
  }

  // Retry acquire timeouts - they may be transient (pool temporarily exhausted)
  // With the Promise-based pool API fix, acquire timeouts should be rare
  // and retrying with backoff gives the pool time to free connections
  if (lowerMessage.includes("acquire timeout")) {
    console.debug("[snowflake] Retrying acquire timeout", { attempt })
    return true
  }

  // Retry on transient network errors
  const isTransientError = TRANSIENT_ERROR_TOKENS.some((token) => upperMessage.includes(token))
  if (isTransientError) {
    return true
  }

  // Retry if connection is already in progress (concurrent connection attempt)
  if (lowerMessage.includes(RETRY_MESSAGE)) {
    return true
  }

  // Default: don't retry unknown errors
  return false
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

// =============================================================================
// POOL TYPE: The Snowflake SDK pool uses generic-pool which is Promise-based
// =============================================================================
type SnowflakePool = snowflake.Pool<snowflake.Connection> & {
  acquire: () => Promise<snowflake.Connection>
  release: (conn: snowflake.Connection) => Promise<void> | void
}

/**
 * Acquire a connection from the pool with timeout protection.
 * 
 * CRITICAL: Uses Promise-based API (generic-pool style), NOT callback-based.
 * The Snowflake SDK pool's acquire() returns a Promise, not a callback.
 * 
 * @param requestId - Request ID for logging/tracing
 * @param timeoutMs - Custom timeout (defaults to ACQUIRE_TIMEOUT_MS)
 * @returns Promise resolving to a Snowflake connection
 */
async function acquireConnection(
  requestId: string,
  timeoutMs: number = ACQUIRE_TIMEOUT_MS
): Promise<snowflake.Connection> {
  const activePool = getPool() as unknown as SnowflakePool
  const start = Date.now()

  console.info("[snowflake][acquire] Starting connection acquire", {
    requestId,
    timeoutMs,
  })

  // Track whether we've already resolved/rejected
  let settled = false
  let lateConnection: snowflake.Connection | null = null

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (!settled) {
        settled = true
        const elapsed = Date.now() - start
        console.error("[snowflake][acquire] Timeout fired", {
          requestId,
          elapsedMs: elapsed,
          timeoutMs,
        })
        reject(new Error(`[snowflake] acquire timeout after ~${elapsed}ms`))
      }
    }, timeoutMs)
  })

  // Create acquire promise (Promise-based API)
  const acquirePromise = activePool.acquire().then((connection) => {
    if (settled) {
      // Timeout already fired - destroy this late connection
      console.warn("[snowflake][acquire] Late connection received after timeout, destroying", {
        requestId,
        elapsedMs: Date.now() - start,
      })
      lateConnection = connection
      destroyConnection(connection)
      // Return a rejected promise to ensure we don't resolve with this connection
      throw new Error("[snowflake] Connection acquired after timeout (destroyed)")
    }
    return connection
  })

  try {
    // Race between acquire and timeout
    const connection = await Promise.race([acquirePromise, timeoutPromise])
    settled = true

    const elapsed = Date.now() - start
    console.info("[snowflake][acquire] Connection acquired successfully", {
      requestId,
      elapsedMs: elapsed,
    })

    if (!connection) {
      throw new Error("[snowflake] Failed to acquire Snowflake connection from pool")
    }

    return connection
  } catch (err) {
    settled = true
    throw err
  }
}

/**
 * Release a connection back to the pool.
 * 
 * CRITICAL: Uses Promise-based API. The release() may return a Promise.
 * 
 * @param connection - The connection to release
 */
async function releaseConnection(connection: snowflake.Connection): Promise<void> {
  const activePool = getPool() as unknown as SnowflakePool
  try {
    const result = activePool.release(connection)
    // Await if it returns a promise
    if (result && typeof (result as Promise<void>).then === "function") {
      await result
    }
  } catch (err) {
    console.warn("[snowflake] failed to release connection", err)
  }
}

/**
 * Run a cheap SELECT 1 query to validate a connection is working.
 * Used during pool warming to ensure connections are actually usable.
 */
async function validateConnectionWithQuery(
  connection: snowflake.Connection,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false
    const timeoutId = setTimeout(() => {
      if (finished) return
      finished = true
      reject(new Error("[snowflake] warm validation query timeout"))
    }, timeoutMs)

    connection.execute({
      sqlText: "SELECT 1 AS WARM_CHECK",
      complete: (err) => {
        if (finished) return
        finished = true
        clearTimeout(timeoutId)
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      },
    })
  })
}

/**
 * Pre-warm the connection pool by acquiring, validating, and releasing connections.
 * This reduces cold-start latency for concurrent requests.
 *
 * CRITICAL: Connections are acquired and released SEQUENTIALLY, not in parallel.
 * The Snowflake SDK pool has a maximum acquisition queue - when you try to acquire
 * multiple connections simultaneously before releasing any, you hit a deadlock.
 *
 * Features:
 * - Only runs once (uses poolWarmed flag)
 * - Prevents concurrent warming (uses warmingInProgress flag)
 * - Acquires and releases connections SEQUENTIALLY to avoid deadlock
 * - Runs a cheap SELECT 1 to validate each connection
 * - Has configurable timeout per connection (default 10s)
 * - Logs detailed performance metrics
 * - Never throws errors (graceful degradation)
 *
 * @param count - Number of connections to pre-create (default: POOL_WARM_SIZE)
 */
export async function warmPool(count: number = POOL_WARM_SIZE): Promise<void> {
  // Prevent concurrent warming attempts
  if (poolWarmed || warmingInProgress) {
    console.log("[snowflake][warm] Pool already warmed or warming in progress, skipping")
    return
  }

  warmingInProgress = true
  const startTime = Date.now()
  const failures: Array<{ index: number; error: string; elapsedMs: number }> = []
  let successCount = 0

  console.info("[snowflake][warm] Starting pool warming", {
    targetConnections: count,
    timeoutPerConnectionMs: POOL_WARM_TIMEOUT_MS,
    poolMax: POOL_MAX,
  })

  // CRITICAL: Acquire and release SEQUENTIALLY, not in parallel
  // This avoids the Snowflake SDK pool acquisition queue deadlock
  for (let i = 0; i < count; i++) {
    const connStart = Date.now()
    let connection: snowflake.Connection | null = null

    try {
      // Acquire connection using the Promise-based API with custom timeout
      connection = await acquireConnection(`warm-pool-${i}`, POOL_WARM_TIMEOUT_MS)
      const acquireMs = Date.now() - connStart

      // Run a cheap SELECT 1 to validate the connection actually works
      const queryStart = Date.now()
      await validateConnectionWithQuery(connection, 5000)
      const queryMs = Date.now() - queryStart

      // CRITICAL: Release IMMEDIATELY after validating
      // Don't wait to release all at the end - this causes the deadlock
      await releaseConnection(connection)
      connection = null // Mark as released

      const elapsedMs = Date.now() - connStart
      successCount++

      console.info("[snowflake][warm] Connection warmed successfully", {
        connectionIndex: i,
        acquireMs,
        queryMs,
        totalMs: elapsedMs,
        successCount,
        totalTarget: count,
      })
    } catch (error) {
      const elapsedMs = Date.now() - connStart
      const errorMessage = getErrorMessage(error)

      failures.push({
        index: i,
        error: errorMessage,
        elapsedMs,
      })

      console.warn("[snowflake][warm] Connection failed", {
        connectionIndex: i,
        elapsedMs,
        error: errorMessage,
      })

      // If we acquired a connection but validation failed, release/destroy it
      if (connection) {
        try {
          await releaseConnection(connection)
        } catch {
          // Ignore release errors during warm failure
        }
      }

      // Don't fail completely - continue trying other connections
      continue
    }
  }

  const totalElapsedMs = Date.now() - startTime
  const successRate = count > 0 ? `${Math.round((successCount / count) * 100)}%` : "0%"

  console.info("[snowflake][warm] Pool warming complete", {
    totalElapsedMs,
    successCount,
    failureCount: failures.length,
    targetCount: count,
    successRate,
    ...(failures.length > 0 && { failures }),
  })

  // Mark as warmed even if some connections failed
  // This prevents retry loops
  warmingInProgress = false
  poolWarmed = true
  
  console.info("[snowflake][warm] Pool warming finished, poolWarmed=true")
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/** Timeout for health check connection acquisition (bounded by ACQUIRE_TIMEOUT_MS) */
const HEALTH_CHECK_ACQUIRE_TIMEOUT_MS = Math.min(ACQUIRE_TIMEOUT_MS, 12000)

/** Timeout for health check query execution (bounded by EXECUTE_TIMEOUT_MS) */
const HEALTH_CHECK_QUERY_TIMEOUT_MS = Math.min(EXECUTE_TIMEOUT_MS, 10000)

/** Result type for connection health check */
export type HealthCheckResult = {
  healthy: boolean
  acquireMs?: number
  queryMs?: number
  totalMs: number
  error?: string
}

/**
 * Check if the Snowflake connection pool is healthy.
 *
 * This function performs a lightweight health check by:
 * 1. Acquiring a connection from the pool (bounded by ACQUIRE_TIMEOUT_MS)
 * 2. Running a simple query: SELECT 1 AS health_check (bounded by EXECUTE_TIMEOUT_MS)
 * 3. Releasing the connection back to the pool
 *
 * Use this before fetching pacing data to verify Snowflake connectivity.
 *
 * @returns HealthCheckResult with healthy status and timing metrics
 *
 * @example
 * const result = await checkConnectionHealth()
 * if (!result.healthy) {
 *   console.error('Snowflake unavailable:', result.error)
 *   return fallbackData
 * }
 */
export async function checkConnectionHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  let connection: snowflake.Connection | null = null
  let acquireMs: number | undefined
  let queryMs: number | undefined

  try {
    // Step 1: Acquire a connection using Promise-based API with timeout
    const acquireStart = Date.now()
    connection = await acquireConnection("health-check", HEALTH_CHECK_ACQUIRE_TIMEOUT_MS)
    acquireMs = Date.now() - acquireStart

    // Step 2: Run a simple health check query
    const queryStart = Date.now()
    const rows = await executeHealthCheckQuery(connection)
    queryMs = Date.now() - queryStart

    // Verify we got the expected result
    if (!rows || rows.length === 0) {
      throw new Error("Health check query returned no rows")
    }

    const totalMs = Date.now() - startTime

    console.info("[snowflake][health] Connection healthy", {
      acquireMs,
      queryMs,
      totalMs,
    })

    return {
      healthy: true,
      acquireMs,
      queryMs,
      totalMs,
    }
  } catch (err) {
    const totalMs = Date.now() - startTime
    const errorMessage = getErrorMessage(err)
    const stage = acquireMs === undefined ? "acquire" : queryMs === undefined ? "query" : "validation"

    // Log pool stats and circuit breaker status for debugging
    const poolStats = getPoolStats()
    const cbStatus = getCircuitBreakerStatus()

    // Log detailed error information for debugging
    console.error("[snowflake][health] Connection unhealthy", {
      error: errorMessage,
      acquireMs,
      queryMs,
      totalMs,
      stage,
      poolStats: {
        initialized: poolStats.initialized,
        active: poolStats.active,
        idle: poolStats.idle,
        pending: poolStats.pending,
        totalCreated: poolStats.totalCreated,
        max: poolStats.max,
        warmed: poolStats.warmed,
      },
      circuitBreaker: {
        isOpen: cbStatus.isOpen,
        consecutiveFailures: cbStatus.consecutiveFailures,
        timeUntilResetMs: cbStatus.timeUntilResetMs,
      },
    })

    // Also call logPoolStats for more detailed output when DEBUG is enabled
    logPoolStats()

    return {
      healthy: false,
      acquireMs,
      queryMs,
      totalMs,
      error: errorMessage,
    }
  } finally {
    // Step 3: Always release the connection back to the pool
    if (connection) {
      try {
        await releaseConnection(connection)
      } catch (err) {
        console.warn("[snowflake][health] Failed to release connection", getErrorMessage(err))
      }
    }
  }
}

/**
 * Execute a simple health check query with timeout.
 * Uses a minimal query that doesn't require any table access.
 */
async function executeHealthCheckQuery(
  connection: snowflake.Connection
): Promise<Array<{ HEALTH_CHECK: number }>> {
  return new Promise((resolve, reject) => {
    let finished = false

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (finished) return
      finished = true
      reject(new Error("[snowflake] Health check query timeout"))
    }, HEALTH_CHECK_QUERY_TIMEOUT_MS)

    // Execute the query
    connection.execute({
      sqlText: "SELECT 1 AS HEALTH_CHECK",
      complete: (err, _stmt, rows) => {
        if (finished) return
        finished = true
        clearTimeout(timeoutId)

        if (err) {
          reject(err)
        } else {
          resolve((rows ?? []) as Array<{ HEALTH_CHECK: number }>)
        }
      },
    })
  })
}

async function executeWithTimeout<T = any>(
  connection: snowflake.Connection,
  sqlText: string,
  binds: any[] = [],
  timeoutMs: number = EXECUTE_TIMEOUT_MS,
  label: string = "query",
  requestId?: string
): Promise<T[]> {
  let stmt: snowflake.RowStatement | null = null
  let finished = false
  let timeoutId: NodeJS.Timeout | null = null

  const wrapError = (message: string) => {
    const trimmed = sqlText.slice(0, 60).replace(/\s+/g, " ").trim()
    return new Error(`[snowflake] ${message}: ${trimmed}`)
  }

  const promise = new Promise<T[]>((resolve, reject) => {
    const resolveOnce = (rows: T[] = [] as T[]) => {
      if (finished) return
      finished = true
      if (timeoutId) clearTimeout(timeoutId)
      resolve(rows)
    }
    const rejectOnce = (err: unknown) => {
      if (finished) return
      finished = true
      if (timeoutId) clearTimeout(timeoutId)
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
      ;(timeoutError as any).__sfTimedOut = true
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
    const elapsed = Date.now() - start
    const isInit = label.startsWith("init:")
    const logLabel = isInit ? "[snowflake][init]" : "[snowflake][timing]"
    console.info(logLabel, { requestId, label, ms: elapsed })
  }
  return result
}

async function executeWithTimeoutVoid(
  connection: snowflake.Connection,
  sqlText: string,
  timeoutMs: number,
  label: string,
  requestId?: string
) {
  let finished = false
  let timeoutId: NodeJS.Timeout | null = null
  let stmt: snowflake.RowStatement | null = null

  const resolveRejectOnce = () => {
    if (timeoutId) clearTimeout(timeoutId)
  }

  const start = DEBUG_SNOWFLAKE ? Date.now() : null

  await new Promise<void>((resolve, reject) => {
    const resolveOnce = () => {
      if (finished) return
      finished = true
      resolveRejectOnce()
      resolve()
    }
    const rejectOnce = (err: unknown) => {
      if (finished) return
      finished = true
      resolveRejectOnce()
      reject(err)
    }

    stmt = connection.execute({
      sqlText,
      complete: (err) => {
        if (err) {
          rejectOnce(err)
        } else {
          resolveOnce()
        }
      },
    })

    timeoutId = setTimeout(() => {
      const err = new Error(`[snowflake] init timeout: ${label}`)
      try {
        stmt?.cancel(() => rejectOnce(err))
      } catch {
        rejectOnce(err)
      }
    }, timeoutMs)
  })

  if (DEBUG_SNOWFLAKE && start !== null) {
    const elapsed = Date.now() - start
    console.info(`[snowflake][init] ${label} ms=${elapsed}`, { requestId })
  }
}

async function initSession(connection: snowflake.Connection, requestId: string) {
  const marker = INIT as unknown as keyof typeof connection
  if ((connection as any)[marker]) return

  await executeWithTimeoutVoid(
    connection,
    `ALTER SESSION SET TIMEZONE = 'Australia/Melbourne';`,
    INIT_TIMEOUT_MS,
    "timezone",
    requestId
  )
  await executeWithTimeoutVoid(
    connection,
    `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${STATEMENT_TIMEOUT_IN_SECONDS};`,
    INIT_TIMEOUT_MS,
    "statement_timeout",
    requestId
  )
  await executeWithTimeoutVoid(
    connection,
    `ALTER SESSION SET QUERY_TAG = '${QUERY_TAG}';`,
    INIT_TIMEOUT_MS,
    "query_tag",
    requestId
  )

  ;(connection as any)[marker] = true
}

function createRequestId(existing?: string) {
  if (existing) return existing
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Execute a Snowflake query with retry logic and circuit breaker protection.
 * 
 * Features:
 * - Retries on transient network errors (ECONNRESET, ETIMEDOUT, etc.)
 * - Does NOT retry on auth errors or acquire timeouts
 * - Exponential backoff with jitter (capped at MAX_BACKOFF_MS)
 * - Maximum total retry time limit (120 seconds)
 * - Circuit breaker to prevent hammering Snowflake during outages
 * 
 * @param sqlText - SQL query to execute
 * @param binds - Parameter bindings
 * @param options - Options including requestId for tracing
 * @returns Query result rows
 * @throws Error if query fails after all retries or circuit breaker is open
 */
export async function execWithRetry<T = any>(
  sqlText: string,
  binds: any[] = [],
  options: { requestId?: string } = {}
): Promise<T[]> {
  const requestId = createRequestId(options.requestId)
  const startTime = Date.now()

  // Check circuit breaker before attempting
  if (!isCircuitClosed()) {
    const status = getCircuitBreakerStatus()
    const error = new Error(
      `[snowflake] Circuit breaker is open (${status.consecutiveFailures} consecutive failures). ` +
      `Retry in ${Math.ceil((status.timeUntilResetMs ?? 0) / 1000)}s.`
    )
    console.error("[snowflake][circuit] Request blocked by circuit breaker", {
      requestId,
      consecutiveFailures: status.consecutiveFailures,
      timeUntilResetMs: status.timeUntilResetMs,
    })
    throw error
  }

  let attempt = 0
  let lastError: unknown = null

  while (true) {
    // Check total elapsed time before each attempt
    const totalElapsed = Date.now() - startTime
    if (totalElapsed >= MAX_TOTAL_RETRY_TIME_MS) {
      console.error("[snowflake] Exceeded maximum total retry time", {
        requestId,
        totalElapsedMs: totalElapsed,
        maxRetryTimeMs: MAX_TOTAL_RETRY_TIME_MS,
        attempts: attempt,
        lastError: lastError ? getErrorMessage(lastError) : undefined,
      })
      recordFailure()
      throw formatError(
        lastError ?? new Error(`Exceeded maximum retry time (${MAX_TOTAL_RETRY_TIME_MS}ms)`)
      )
    }

    let connection: snowflake.Connection | null = null
    let destroyAfterRelease = false
    let destroyImmediately = false
    let releaseStart: number | null = null

    try {
      const acquireStart = DEBUG_SNOWFLAKE ? Date.now() : null
      connection = await acquireConnection(requestId)
      if (DEBUG_SNOWFLAKE && acquireStart !== null) {
        console.info("[snowflake][timing]", { requestId, label: "acquire_ms", ms: Date.now() - acquireStart })
      }

      const initStart = DEBUG_SNOWFLAKE ? Date.now() : null
      await initSession(connection, requestId)
      if (DEBUG_SNOWFLAKE && initStart !== null) {
        console.info("[snowflake][timing]", { requestId, label: "init_ms", ms: Date.now() - initStart })
      }

      const queryStart = DEBUG_SNOWFLAKE ? Date.now() : null
      const result = await executeWithTimeout<T>(
        connection,
        sqlText,
        binds,
        EXECUTE_TIMEOUT_MS,
        "query",
        requestId
      )
      if (DEBUG_SNOWFLAKE && queryStart !== null) {
        console.info("[snowflake][timing]", { requestId, label: "query_ms", ms: Date.now() - queryStart })
      }

      // Success! Reset circuit breaker and return result
      recordSuccess()
      return result
    } catch (err) {
      lastError = err

      if (connection) {
        destroyAfterRelease = true
        destroyImmediately = Boolean((err as any)?.__sfTimedOut)
        console.debug("[snowflake] marking connection for destroyAfterRelease", {
          attempt,
          error: getErrorMessage(err),
          requestId,
          timedOut: destroyImmediately,
        })
        if (DEBUG_SNOWFLAKE) {
          console.info("[snowflake] destroyAfterRelease", { requestId, attempt, timedOut: destroyImmediately })
        }
      }

      // Check if we should retry this error
      const isRetriable = shouldRetry(err, attempt)
      const hasRetriesLeft = attempt < MAX_RETRIES
      const totalElapsedNow = Date.now() - startTime
      const hasTimeLeft = totalElapsedNow < MAX_TOTAL_RETRY_TIME_MS

      if (!isRetriable || !hasRetriesLeft || !hasTimeLeft) {
        // Log why we're not retrying
        if (!isRetriable) {
          console.debug("[snowflake] Error is not retriable", { requestId, attempt, error: getErrorMessage(err) })
        } else if (!hasRetriesLeft) {
          console.debug("[snowflake] Max retries exceeded", { requestId, attempt, maxRetries: MAX_RETRIES })
        } else if (!hasTimeLeft) {
          console.debug("[snowflake] Max total time exceeded", { requestId, totalElapsedMs: totalElapsedNow })
        }

        recordFailure()
        throw formatError(err)
      }

      // Calculate backoff with exponential increase and jitter, capped at MAX_BACKOFF_MS
      const exponentialBackoff = BASE_BACKOFF_MS * Math.pow(2, attempt)
      const cappedBackoff = Math.min(exponentialBackoff, MAX_BACKOFF_MS)
      const jitter = 0.5 + Math.random() // 0.5x - 1.5x
      const delayMs = Math.round(cappedBackoff * jitter)
      const remainingMs = MAX_TOTAL_RETRY_TIME_MS - totalElapsedNow
      if (remainingMs <= delayMs) {
        console.debug("[snowflake] Retry delay exceeds remaining budget", {
          requestId,
          attempt,
          delayMs,
          remainingMs,
        })
        recordFailure()
        throw formatError(err)
      }

      console.info("[snowflake] Retrying after transient error", {
        requestId,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        delayMs,
        totalElapsedMs: totalElapsedNow,
        maxTotalTimeMs: MAX_TOTAL_RETRY_TIME_MS,
        error: getErrorMessage(err),
      })

      attempt += 1
      await delay(delayMs)
    } finally {
      if (connection) {
        releaseStart = DEBUG_SNOWFLAKE ? Date.now() : null
        try {
          // Fix race condition: destroy BEFORE release to prevent another request
          // from acquiring a stale/broken connection
          if (destroyAfterRelease || destroyImmediately) {
            destroyConnection(connection)
          } else {
            await releaseConnection(connection)
          }
        } catch (e) {
          console.error("[snowflake] release/destroy failed", e)
        }
        if (DEBUG_SNOWFLAKE && releaseStart !== null) {
          console.info("[snowflake][timing]", { requestId, label: "release_ms", ms: Date.now() - releaseStart })
        }
      }
    }
  }
}
