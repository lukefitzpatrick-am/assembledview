import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { parseWorkloadWeeks } from "@/lib/codex/workload"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../_shared"
import { projectsErrorResponse } from "../projects/_gate"

export const runtime = "nodejs"

/**
 * GET `?weeks=1..12` (B42, plan 5.5): open tasks per active roster person by
 * week of due date (this Sydney week and the next ones), with overdue, no due
 * date and later. Only tasks the viewer may see (private projects). Behind
 * codex_projects (404 before auth when off); 503 before 0118.
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const weeks = parseWorkloadWeeks(new URL(request.url).searchParams.get("weeks"))
  try {
    const { loadWorkload } = await import("@/lib/codex/workloadRepo")
    return NextResponse.json(await loadWorkload(email, weeks))
  } catch (error) {
    return projectsErrorResponse(error, "load the workload")
  }
}
