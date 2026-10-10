/**
 * Cron and admin job results. Same stdout as `console.log`.
 * App and component code does not call `console.log`; the lint rule allows warn and error only.
 */
export function logJob(...args: unknown[]): void {
  console.log(...args)
}
