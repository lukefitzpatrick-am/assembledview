"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  SESSION_EXPIRED_BANNER_BODY,
  SESSION_EXPIRED_TITLE,
  getWriteSessionExpiredSnapshot,
  loginReturnHref,
  subscribeWriteSessionExpiry,
} from "@/lib/auth/writeSessionExpiry"

export function SessionExpiredBanner({ pathname }: { pathname: string }) {
  const visible = useSyncExternalStore(
    subscribeWriteSessionExpiry,
    getWriteSessionExpiredSnapshot,
    getWriteSessionExpiredSnapshot
  )

  if (!visible) return null
  if (pathname.startsWith("/auth")) return null

  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 border-t-0 border-border bg-destructive/10"
    >
      <AlertTitle>{SESSION_EXPIRED_TITLE}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>{SESSION_EXPIRED_BANNER_BODY}</p>
        <Button asChild variant="destructive" size="sm" className="shrink-0">
          <Link href={loginReturnHref(pathname)}>Sign in</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
