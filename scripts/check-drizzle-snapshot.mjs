#!/usr/bin/env node
/**
 * Fail if `npm run db:generate` would emit a snapshot/SQL diff.
 * Proves db/drizzle matches db/schema/*.ts (not that mirrors match Postgres —
 * that is db:drift).
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const env = {
  ...process.env,
  DIRECT_URL:
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@127.0.0.1:5432/postgres",
}

const generate = spawnSync("npm", ["run", "db:generate"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
  shell: true,
})
if (generate.status !== 0) {
  process.exit(generate.status ?? 1)
}

const diff = spawnSync(
  "git",
  ["diff", "--exit-code", "--", "db/drizzle"],
  {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  },
)
if (diff.status !== 0) {
  console.error(
    "db:generate produced a diff under db/drizzle. The snapshot no longer matches db/schema/*.ts. Hand-sync the mirror, then commit the new snapshot — do not apply the generated SQL to live Postgres.",
  )
  process.exit(1)
}

const untracked = spawnSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "db/drizzle"],
  { cwd: rootDir, encoding: "utf8", shell: false },
)
if (untracked.status !== 0) process.exit(untracked.status ?? 1)
const extra = (untracked.stdout || "").trim()
if (extra) {
  console.error(
    "db:generate left untracked files under db/drizzle:\n" + extra,
  )
  process.exit(1)
}

console.log("OK: db:generate is an empty diff (snapshot matches db/schema/*.ts).")
