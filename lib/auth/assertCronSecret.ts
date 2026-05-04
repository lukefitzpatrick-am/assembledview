/**
 * Vercel cron and manual job auth: set `CRON_SECRET` and send either
 * `x-cron-secret: <secret>` or `Authorization: Bearer <secret>`.
 */
export function assertCronSecret(request: Pick<Request, "headers">): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const h = request.headers.get("x-cron-secret")?.trim()
  if (h === secret) return true
  const auth = request.headers.get("authorization")?.trim()
  return auth === `Bearer ${secret}`
}
