import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"

export default async function PacingLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/overview")
  }
  return <>{children}</>
}
