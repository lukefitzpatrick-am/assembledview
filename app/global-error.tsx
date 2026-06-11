"use client"

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
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f4f4f5",
          color: "#18181b",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: "0.5rem",
              padding: "1.5rem",
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
            }}
          >
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 1rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#71717a", margin: "0 0 1rem" }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest ? (
              <p style={{ fontSize: "0.75rem", color: "#a1a1aa", margin: "0 0 1rem" }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#18181b",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                Try again
              </button>
              <a href="/dashboard" style={{ color: "#18181b", fontSize: "0.875rem" }}>
                Back to dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
