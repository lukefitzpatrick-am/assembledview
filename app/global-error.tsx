"use client"

import Link from "next/link"
import { useEffect } from "react"
import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"

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
      <body
        style={{
          margin: 0,
          background: BRAND.colour.sand,
          color: BRAND.colour.ink,
          fontFamily: EMAIL_FONT_STACK,
        }}
      >
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 28 * 16 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Something went wrong.
            </h1>
            <p style={{ margin: "0 0 16px", color: BRAND.colour.muted, fontSize: 15, lineHeight: 1.5 }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest ? (
              <p style={{ margin: "0 0 16px", color: BRAND.colour.muted, fontSize: 12 }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  background: BRAND.colour.lime,
                  color: BRAND.colour.ink,
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 20px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <Link
                href="/dashboard"
                style={{
                  color: BRAND.colour.ink,
                  fontSize: 14,
                  alignSelf: "center",
                }}
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
