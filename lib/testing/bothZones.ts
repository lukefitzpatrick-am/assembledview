/**
 * Import first in a test whose subject both the browser and the server reach
 * (`import "@/lib/testing/bothZones"`). `scripts/run-tests.mjs` runs such a
 * file twice: in Melbourne, the browser's zone, then in UTC, the server's
 * (CI and Vercel), with `RUN_TESTS_UTC_PASS=1`. Melbourne catches a
 * local-versus-UTC mix-up; UTC catches a host-zone read where the Melbourne
 * day is meant. Neither zone alone catches both (RUNFIX2fix, V32).
 *
 * The runner finds the file by this import line, so it stays a plain
 * `import "@/lib/testing/bothZones"` above the other imports.
 */
import { BUSINESS_TZ } from "@/lib/dates/melbourne"

import { pinZone } from "./melbourneZone"

pinZone(process.env.RUN_TESTS_UTC_PASS === "1" ? "UTC" : BUSINESS_TZ)
