import snowflake from "snowflake-sdk"

type SnowflakeEnv = {
  account: string | undefined
  username: string | undefined
  password: string | undefined
  role: string | undefined
  warehouse: string | undefined
  database: string | undefined
  schema: string | undefined
}

const isServer = typeof window === "undefined"

function getEnv(): SnowflakeEnv {
  return {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  }
}

function ensureConfig(env: SnowflakeEnv) {
  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length) {
    throw new Error(`Missing Snowflake env vars: ${missing.join(", ")}`)
  }
}

export async function querySnowflake<T = Record<string, unknown>>(
  sql: string,
  binds: any[] = []
): Promise<T[]> {
  const env = getEnv()
  ensureConfig(env)

  const connection = snowflake.createConnection({
    account: env.account!,
    username: env.username!,
    password: env.password!,
    role: env.role!,
    warehouse: env.warehouse!,
    database: env.database!,
    schema: env.schema!,
  })

  const log = (...args: unknown[]) => {
    if (isServer) {
      console.log("[snowflake]", ...args)
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          reject(err)
        } else {
          log("connected")
          resolve()
        }
      })
    })

    return await new Promise<T[]>((resolve, reject) => {
      const statement = connection.execute({
        sqlText: sql,
        binds,
        complete: (err, _stmt, rows) => {
          if (err) {
            reject(err)
          } else {
            resolve((rows ?? []) as T[])
          }
        },
      })

      statement.once("error", reject)
    })
  } finally {
    connection.destroy((err) => {
      if (err) {
        console.warn("[snowflake] destroy error", err)
      } else {
        log("connection closed")
      }
    })
  }
}
