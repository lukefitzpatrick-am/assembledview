/**
 * Runs in the browser before any app module (Next client instrumentation).
 *
 * zod never calls `new Function`. zod 4 probes `new Function("")` the first time
 * an object schema is built, and compiles fast parsers with it. Production
 * `script-src` has no 'unsafe-eval', so the probe would send a CSP report from
 * our own chunk on every page with a form schema (S27, docs/brain/SECURITY-HEADERS.md).
 * The forms validate through zodResolver's async parse, which never used the
 * compiled parsers. zod keeps this setting on globalThis, so every copy sees it.
 */
import { config } from "zod"

config({ jitless: true })
