import { redirect } from "next/navigation"

import { CreativeAssetManager } from "@/components/creative/CreativeAssetManager"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"

type CreativePageProps = {
  params: Promise<{ mba_number: string }>
}

export default async function CreativeAssetsPage({ params }: CreativePageProps) {
  const session = await auth0.getSession()
  if (!session?.user) {
    const { mba_number } = await params
    redirect(`/auth/login?returnTo=/mediaplans/mba/${encodeURIComponent(mba_number)}/creative`)
  }

  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    redirect("/unauthorized")
  }

  const { mba_number } = await params

  return (
    <div className="w-full min-h-screen" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10 pt-0 pb-24 space-y-6">
        <CreativeAssetManager mbaNumber={mba_number} showPageHeader />
      </div>
    </div>
  )
}
