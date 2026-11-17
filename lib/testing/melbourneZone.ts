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
 */
import { BUSINESS_TZ } from "@/lib/dates/melbourne"

process.env.TZ = BUSINESS_TZ
