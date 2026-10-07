import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/PageHeader"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-xl space-y-6">
        <PageHeader
          title="Page not found"
          lede="This page doesn't exist or has moved."
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
