/**
 * Manual local invocation of the Xero sync pipeline (parity mode).
 * Usage: npx tsx scripts/migration/run-xero-sync.ts
 */
import { closeDb } from "@/db"
import { loadEnvLocal } from "./_shared"
import { clearXeroTokenCache } from "@/lib/xero/client"
import { runXeroSync } from "@/lib/xero/runSync"

loadEnvLocal()
clearXeroTokenCache()

async function main() {
  const result = await runXeroSync()
  console.log(JSON.stringify(result, null, 2))
  await closeDb()
  if (result.status !== "success") process.exit(2)
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
