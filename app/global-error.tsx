"use client"

import Link from "next/link"
import { useEffect } from "react"

export default function GlobalError({
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
    <html lang="en">
      <body className="m-0 bg-background font-sans text-foreground">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-card border border-border bg-card p-6 text-center shadow-e1">
            <h1 className="mb-4 text-2xl font-semibold">
              Something went wrong
            </h1>
            <p className="mb-4 text-muted-foreground">
              An unexpected error occurred. Please try again.
            </p>
            {error.digest ? (
              <p className="mb-4 text-xs text-muted-foreground">
                Reference: {error.digest}
              </p>
            ) : null}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Try again
              </button>
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-input px-3 text-sm text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
