/**
 * Import first in a test whose subject runs only in the browser and reads
 * host-local dates (`import "@/lib/testing/melbourneZone"`), so the code under
 * test loads and runs in the user's zone. `npm test` starts every test child
 * in UTC, as CI and Vercel do; browser code runs in Melbourne, where local
 * midnight is the day before in UTC. A local-versus-UTC mix-up passes in UTC
 * and fails here.
 *
 * Which pin (RUNFIX2fix, V32):
 * - subject runs only in the browser: this module (Melbourne);
 * - subject reached by the browser and the server: `./bothZones` (Melbourne,
 *   then a second runner pass in UTC);
 * - subject runs only on the server: no pin (UTC).
 *
 * `lib/dates/melbourne` (and `civil`) load before the pin. They build only
 * explicit-zone formatters at load, so that order is safe.
 *
 * The zone change needs a process of its own: Node ignores `TZ` set inside a
 * worker thread. Vitest's forks pool (the default) gives each file one; under
 * `--pool=threads` `pinZone` throws instead of running the file in UTC.
 */
import { BUSINESS_TZ } from "@/lib/dates/melbourne"

/** Sets the process zone and throws when it did not take effect. */
export function pinZone(zone: string): void {
  process.env.TZ = zone
  const now = new Intl.DateTimeFormat().resolvedOptions().timeZone
  if (now !== zone) {
    throw new Error(`lib/testing: the test zone is ${now}, not ${zone}. TZ cannot change inside a worker thread: run this file in its own process (Vitest forks pool).`)
  }
}

pinZone(BUSINESS_TZ)
