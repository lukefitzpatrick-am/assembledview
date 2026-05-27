import axios from "axios"
import { notFound, redirect } from "next/navigation"
import { xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"

type MediaPlanVersion = {
  mba_number?: string | null
  mbanumber?: string | null
  version_number?: number | null
}

/**
 * Legacy `/mediaplans/{id}/edit` URLs redirect to the canonical MBA editor.
 */
export default async function LegacyMediaPlanEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const versionsUrl = `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?id=${encodeURIComponent(id)}`

  let mediaPlanVersion: MediaPlanVersion | undefined
  try {
    const response = await axios.get(versionsUrl, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 55_000,
    })
    const data = response.data
    mediaPlanVersion = Array.isArray(data) ? data[0] : data
  } catch {
    notFound()
  }

  if (!mediaPlanVersion) {
    notFound()
  }

  const mbaNumber = (mediaPlanVersion.mba_number ?? mediaPlanVersion.mbanumber ?? "").trim()
  if (!mbaNumber) {
    notFound()
  }

  const version =
    mediaPlanVersion.version_number != null ? String(mediaPlanVersion.version_number) : null
  const versionQuery = version ? `?version=${encodeURIComponent(version)}` : ""

  redirect(`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit${versionQuery}`)
}
