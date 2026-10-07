"use client"

import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"

export default function SupportPage() {
  return (
    <PageShell width="narrow">
      <PageHeader title="Support" lede="Having trouble logging in?" />
      <p>
        Reach out to us at
        <a href="mailto:hello@assembledmedia.com.au" className="ml-1 underline">
          hello@assembledmedia.com.au
        </a>
      </p>
      <p>Our team will get back to you ASAP.</p>
    </PageShell>
  )
}
