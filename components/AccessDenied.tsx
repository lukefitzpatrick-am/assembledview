"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@/components/AuthWrapper"

export type AccessDeniedReason = "permission" | "unconfigured" | "unauthorized"

const COPY: Record<
  AccessDeniedReason,
  { title: string; body: string; primary: "dashboard" | "logout"; showBack?: boolean; showLogin?: boolean }
> = {
  permission: {
    title: "Access denied",
    body: "You do not have permission to view this page. If you believe this is an error, please contact an administrator.",
    primary: "dashboard",
    showLogin: true,
  },
  unconfigured: {
    title: "Access not configured",
    body: "We couldn't find a client workspace for your account. Contact support if you believe this is an error, or try logging out and back in.",
    primary: "logout",
  },
  unauthorized: {
    title: "Access denied",
    body: "You don't have permission to access this page.",
    primary: "dashboard",
    showBack: true,
  },
}

type AccessDeniedProps = {
  reason: AccessDeniedReason
}

/**
 * Shared access-denied surface for `/403`, `/forbidden`, and `/unauthorized`.
 * Routes stay separate — middleware and guards redirect to specific paths.
 */
export function AccessDenied({ reason }: AccessDeniedProps) {
  const copy = COPY[reason]
  const { user, isLoading } = useUser()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (reason !== "unauthorized") return
    if (mounted && !isLoading && !user) {
      router.push("/auth/login?returnTo=/dashboard")
    }
  }, [reason, mounted, isLoading, user, router])

  if (reason === "unauthorized" && (!mounted || isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-foreground" />
      </div>
    )
  }

  if (reason === "unauthorized" && !user) {
    return null
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="max-w-xl space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.body}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {copy.showBack ? (
            <Button variant="outline" onClick={() => router.back()} className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Go back
            </Button>
          ) : null}
          {copy.primary === "logout" ? (
            <Button asChild>
              <Link href="/auth/logout">Log out</Link>
            </Button>
          ) : (
            <Button asChild className="gap-2">
              <Link href="/dashboard">
                <Home className="h-4 w-4" aria-hidden />
                Go to dashboard
              </Link>
            </Button>
          )}
          {copy.primary === "logout" ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          ) : null}
          {copy.showLogin ? (
            <Button variant="outline" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
