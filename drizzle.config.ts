import fs from "fs"
import path from "path"
import { defineConfig } from "drizzle-kit"

function loadEnvFile(file: string): void {
  const full = path.resolve(process.cwd(), file)
  if (!fs.existsSync(full)) return
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

loadEnvFile(".env.local")
loadEnvFile(".env")

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!directUrl) {
  console.warn(
    "[drizzle.config] DIRECT_URL / DATABASE_URL not set — DB-backed kit commands will fail",
  )
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations / introspection must use the direct connection (not pooler).
    url: directUrl || "",
  },
  strict: true,
  verbose: true,
})
