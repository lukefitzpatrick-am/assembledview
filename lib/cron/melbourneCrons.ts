/**
 * S31: the only crons held to a fixed Melbourne time. Vercel crons are UTC,
 * so each one has an AEDT slot and an AEST slot in `vercel.json` (one hour
 * apart) and acts only on the run that falls in its Melbourne hour.
 * finance-pre-run, finance-run, finance-lock and true-up also run at fixed
 * Sydney times with two slots, behind their own window guards (PC5
 * `lib/finance/periods/sydneyClock`, T10); not moved here yet (RELFIX1).
 * Every other cron keeps one UTC slot and moves an hour with daylight saving.
 * `melbourneCrons.b49.test.ts` checks `vercel.json` holds both slots.
 */
import { melbourneParts } from "@/lib/dates/melbourne"

export const MELBOURNE_CRONS = [
  // The 08:30 task digest (Codex reminders and email digest, B41).
  { path: "/api/cron/codex-notifications", melbourneTime: "08:30" },
  // The morning pacing refresh, at the time it ran in AEDT (21:00 UTC), after
  // the 06:30 warehouse refresh; the retry stays half an hour behind it.
  { path: "/api/cron/pacing-portfolio", melbourneTime: "08:00" },
  { path: "/api/cron/pacing-portfolio?retry=1", melbourneTime: "08:30" },
] as const

export type MelbourneCronPath = (typeof MELBOURNE_CRONS)[number]["path"]

/** True when `now` is in the Melbourne hour of that cron's declared time. */
export function isMelbourneCronHour(path: MelbourneCronPath, now: Date): boolean {
  const entry = MELBOURNE_CRONS.find((c) => c.path === path)!
  return melbourneParts(now).hour === Number(entry.melbourneTime.slice(0, 2))
}
