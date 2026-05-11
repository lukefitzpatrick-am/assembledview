import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"

export default async function PacingIndexPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing")
  }

  redirect("/pacing/overview")
}
