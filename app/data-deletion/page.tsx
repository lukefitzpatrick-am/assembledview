import type { Metadata } from "next"
import Link from "next/link"

import { LEGAL_ENTITY_NAME, PRIVACY_EMAIL } from "@/lib/legal/privacyConfig"

export const dynamic = "force-static"

export const metadata: Metadata = {
  title: { absolute: "Data Deletion | AssembledView" },
  description:
    "How to ask Assembled Media to delete personal information held in AssembledView.",
}

export default function DataDeletionPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 text-foreground sm:px-6">
      <h1 className="text-2xl font-bold">Data Deletion</h1>

      <p className="mt-3 text-sm leading-relaxed">
        AssembledView does not use Facebook Login and does not store personal information from
        Facebook or Instagram accounts. We use Meta&apos;s services only to report on advertising
        campaigns our clients run, and that reporting is about campaigns, not individual people.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How to request deletion</h2>
      <p className="mt-3 text-sm leading-relaxed">
        To ask us to delete personal information we hold about you, in AssembledView or from any
        Meta service, email {PRIVACY_EMAIL} with the subject &quot;Data deletion request&quot;.
        Include your name, the email address linked to your account (if you have one), and what you
        would like deleted.
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        We will confirm we have received your request within 5 business days, and complete it within
        30 days. If we need to keep some information, for example to meet tax or legal record-keeping
        obligations, we will tell you what and why.
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        If you removed an app connected to AssembledView in your Facebook settings, you do not need
        to do anything else. We do not receive or keep data from that connection.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Questions</h2>
      <p className="mt-3 text-sm leading-relaxed">
        {LEGAL_ENTITY_NAME}, {PRIVACY_EMAIL}. See our{" "}
        <Link
          href="/privacy"
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  )
}
