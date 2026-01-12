import Link from "next/link"

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">Access not configured</h1>
      <p className="max-w-xl text-gray-600">
        We couldn&apos;t find a client workspace for your account. Contact support if
        you believe this is an error, or try logging out and back in.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/auth/logout"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Log out
        </Link>
        <Link
          href="/dashboard"
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
