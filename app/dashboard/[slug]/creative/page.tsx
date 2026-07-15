import { notFound, redirect } from "next/navigation"

import {
  ClientCreativePicker,
  type ClientCampaignOption,
} from "@/components/creative/ClientCreativePicker"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { getClientDashboardData } from "@/lib/api/dashboard/client"
import { auth0 } from "@/lib/auth0"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { getPrimaryRole, getUserClientIdentifier } from "@/lib/rbac"

interface ClientCreativePageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function ClientCreativePage({ params }: ClientCreativePageProps) {
  const { slug } = await params
  const session = await auth0.getSession()
  const user = session?.user

  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}/creative`)
  }

  const role = getPrimaryRole(user)
  const userClientSlug = getUserClientIdentifier(user)

  if (role === "client") {
    if (!userClientSlug) {
      notFound()
    }

    if (userClientSlug.toLowerCase() !== slug.toLowerCase()) {
      notFound()
    }
  }

  const [data, clientRow] = await Promise.all([
    getClientDashboardData(slug),
    fetchXanoClientRowByUrlSlug(slug),
  ])

  const campaigns: ClientCampaignOption[] = (() => {
    if (!data) return []
    const seen = new Set<string>()
    const options: ClientCampaignOption[] = []
    for (const campaign of data.allCampaigns) {
      const mbaNumber = String(campaign.mbaNumber ?? "").trim()
      if (!mbaNumber || seen.has(mbaNumber)) continue
      seen.add(mbaNumber)
      options.push({
        mbaNumber,
        campaignName: campaign.campaignName,
        status: campaign.status,
        startDate: campaign.startDate,
      })
    }
    return options
  })()

  const metaPageId = String(clientRow?.idmeta ?? "").trim()

  return (
    <div className="w-full min-h-screen" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 pb-24 pt-0 sm:px-5 md:px-6 xl:px-8 2xl:px-10">
        <MediaPlanEditorHero
          className="mb-2 pt-6 md:pt-8"
          title="Creative"
          detail={
            <p className="text-sm text-muted-foreground">
              Upload and manage creative for your campaigns.
            </p>
          }
        />
        <ClientCreativePicker campaigns={campaigns} metaPageId={metaPageId} />
      </div>
    </div>
  )
}
