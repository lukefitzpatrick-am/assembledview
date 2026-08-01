import type { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"

/**
 * Temporary SEC-D soak telemetry. Log every staff-gate 403 from the catch-all
 * Xano proxies so a missed staff consumer surfaces as `[proxy-403]` instead of
 * a silent break. Review at end of soak week; remove in X6 if silent.
 */
export async function logProxy403(
  request: Request,
  proxyPath: string
): Promise<void> {
  try {
    const session = await auth0.getSession(request as NextRequest)
    const user = session?.user
    const roles = user ? getUserRoles(user) : []
    const sub = typeof user?.sub === "string" ? user.sub : ""
    const userIdPrefix = sub.slice(0, 8) || "unknown"
    console.warn(
      `[proxy-403] path=${proxyPath || "(root)"} role=${roles.join(",") || "none"} userId=${userIdPrefix}`
    )
  } catch (err) {
    console.warn("[proxy-403] log failed", err)
  }
}
