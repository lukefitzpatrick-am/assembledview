import { redirect } from "next/navigation"

import { ParseReviewScreen } from "@/components/ingest/ParseReviewScreen"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"

type ParseReviewPageProps = {
  params: Promise<{ mba_number: string; stageId: string }>
}

export default async function ParseReviewPage({ params }: ParseReviewPageProps) {
  const session = await auth0.getSession()
  const { mba_number, stageId } = await params
  if (!session?.user) {
    redirect(
      `/auth/login?returnTo=/mediaplans/mba/${encodeURIComponent(mba_number)}/ingest/${encodeURIComponent(stageId)}`,
    )
  }

  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    redirect("/unauthorized")
  }

  return (
    <div className="w-full min-h-screen pb-24">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 md:px-6 xl:px-8 pt-4">
        <ParseReviewScreen mbaNumber={mba_number} stageId={stageId} />
      </div>
    </div>
  )
}
