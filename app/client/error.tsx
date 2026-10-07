"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/PageHeader"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-xl space-y-6">
        <PageHeader
          title="Couldn't load the client hub"
          lede="An unexpected error occurred. Please try again."
          meta={error.digest ? <span>Reference: {error.digest}</span> : undefined}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
