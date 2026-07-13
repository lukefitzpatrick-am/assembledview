import { redirect } from "next/navigation"

import { AvaCreativeSkillActions } from "@/components/ava/AvaSkillActionSets"
import { CreativeCampaignPicker } from "@/components/creative/CreativeCampaignPicker"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"

export default async function CreativeUploadsPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/creative")
  }

  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    redirect("/unauthorized")
  }

  return (
    <div className="w-full min-h-screen" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 pb-24 pt-0 sm:px-5 md:px-6 xl:px-8 2xl:px-10">
        <MediaPlanEditorHero
          className="mb-2 pt-6 md:pt-8"
          title="Creative uploads"
          detail={
            <p className="text-sm text-muted-foreground">
              Pick a client and campaign, then upload or manage creative assets.
            </p>
          }
          actions={<AvaCreativeSkillActions />}
        />
        <CreativeCampaignPicker />
      </div>
    </div>
  )
}
