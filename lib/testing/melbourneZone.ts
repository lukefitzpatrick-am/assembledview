/**
 * Import first in a test of browser code that reads host-local dates
 * (`import "@/lib/testing/melbourneZone"`), so the code under test loads and
 * runs in the user's zone. `npm test` starts every test child in UTC, as CI
 * and Vercel do; browser code runs in Melbourne, where local midnight is the
 * day before in UTC. A local-versus-UTC mix-up passes in UTC and fails here.
 * Server and cron tests stay UTC.
 *
 * `lib/dates/melbourne` (and `civil`) load before the pin. They build only
 * explicit-zone formatters at load, so that order is safe.
 *
 * The zone change needs a process of its own: Node ignores `TZ` set inside a
 * worker thread. Vitest's forks pool (the default) gives each file one; under
 * `--pool=threads` this module throws instead of running the file in UTC.
 */
import { BUSINESS_TZ } from "@/lib/dates/melbourne"

process.env.TZ = BUSINESS_TZ
const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone
if (zone !== BUSINESS_TZ) {
  throw new Error(`lib/testing: the test zone is ${zone}, not ${BUSINESS_TZ}. TZ cannot change inside a worker thread: run this file in its own process (Vitest forks pool).`)
}
