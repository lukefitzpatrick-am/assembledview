import { notFound } from "next/navigation"

/**
 * Dev-only route group. Chart gallery and any future internal QA surfaces
 * must not be reachable in production builds.
 */
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  return children
}
