import type { Metadata } from "next"
import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ABN,
  LAST_UPDATED,
  LEGAL_ENTITY_NAME,
  POSTAL_ADDRESS,
  PRIVACY_EMAIL,
  RETENTION_TEXT,
  SERVICE_PROVIDERS,
} from "@/lib/legal/privacyConfig"

export const dynamic = "force-static"

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | AssembledView" },
  description:
    "How Assembled Media collects, uses and protects personal information in AssembledView.",
}

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 text-foreground sm:px-6">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <h2 className="mt-8 text-lg font-semibold">About this policy</h2>
      <p className="mt-3 text-sm leading-relaxed">
        AssembledView is a media planning, reporting and finance platform operated by{" "}
        {LEGAL_ENTITY_NAME} (ABN {ABN}), trading as Assembled Media (&quot;we&quot;, &quot;us&quot;).
        This policy explains how we handle personal information in AssembledView, in line with the
        Australian Privacy Principles in the Privacy Act 1988 (Cth).
      </p>

      <h2 className="mt-8 text-lg font-semibold">Who this applies to</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Our staff, our clients&apos; staff who have an AssembledView login, and people whose details
        appear in information our clients or partners give us, such as contacts on media plans,
        invoices and meeting records.
      </p>

      <h2 className="mt-8 text-lg font-semibold">What we collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>Account details: name, work email address, role, and the client accounts you can access.</li>
        <li>
          Sign-in and security information: login times, session cookies and technical logs (IP
          address, browser type) used to keep the service secure.
        </li>
        <li>
          Work content: media plans, budgets, campaign settings, notes, tasks, comments and files you
          add.
        </li>
        <li>
          Business contact details: names, emails and phone numbers of client and supplier contacts
          used for planning and billing.
        </li>
        <li>Finance records: invoice and payment details for client accounts, from Xero.</li>
        <li>
          Meeting records (staff only): if a meeting is recorded through Fireflies.ai, its title,
          attendees, summary and transcript, used for internal notes and time records.
        </li>
        <li>
          Advertising and website reporting: campaign delivery and website analytics for our clients.
          This is generally aggregated and is not used by us to identify individual members of the
          public.
        </li>
      </ul>
      <p className="mt-3 text-sm leading-relaxed">
        We do not ask for sensitive information and ask you not to enter it into AssembledView.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How we collect it</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Directly from you, from your organisation when it sets up your access, from the advertising,
        analytics and finance services our clients connect, and automatically when you use the
        platform.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How we use it</h2>
      <p className="mt-3 text-sm leading-relaxed">
        To provide and secure AssembledView, manage your access, send account invitations and service
        notifications, plan and report on media campaigns, prepare billing and invoices, provide
        support, run the AI assistant features you choose to use, and meet our legal obligations. We
        do not sell personal information and we do not use it for third-party advertising.
      </p>

      <h2 className="mt-8 text-lg font-semibold">AI features</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Some features send the content you are working on to Anthropic&apos;s Claude models to generate
        summaries, drafts and answers. Under its commercial terms, Anthropic does not use this content
        to train its models. AI output may be wrong and is reviewed by our team before it is relied
        on.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Cookies</h2>
      <p className="mt-3 text-sm leading-relaxed">
        AssembledView uses essential cookies to keep you signed in and secure. We do not use
        advertising or analytics tracking cookies in AssembledView.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Who we share it with</h2>
      <p className="mt-3 text-sm leading-relaxed">
        With your organisation&apos;s authorised users, and with the service providers below, who handle
        information on our behalf under contract. We may also disclose information where the law
        requires it.
      </p>
      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Purpose</TableHead>
            <TableHead>Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SERVICE_PROVIDERS.map((provider) => (
            <TableRow key={provider.name}>
              <TableCell>{provider.name}</TableCell>
              <TableCell>{provider.purpose}</TableCell>
              <TableCell>{provider.location}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h2 className="mt-8 text-lg font-semibold">Overseas disclosure</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Some of these providers store or process information outside Australia, mainly in the United
        States. We take reasonable steps to make sure they handle it consistently with the Australian
        Privacy Principles.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Security</h2>
      <p className="mt-3 text-sm leading-relaxed">
        Access is limited by role and client account, sign-in is managed by Auth0, data is encrypted
        in transit, and our primary database is hosted in Sydney. No system is completely secure. If
        an eligible data breach occurs, we will notify affected people and the Office of the
        Australian Information Commissioner as required.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How long we keep it</h2>
      <p className="mt-3 text-sm leading-relaxed">{RETENTION_TEXT}</p>

      <h2 className="mt-8 text-lg font-semibold">Access, correction and complaints</h2>
      <p className="mt-3 text-sm leading-relaxed">
        You can ask to access or correct your personal information, or make a privacy complaint, by
        emailing {PRIVACY_EMAIL} or writing to {POSTAL_ADDRESS}. We will respond within 30 days. If
        you are not satisfied with our response, you can contact the Office of the Australian
        Information Commissioner at oaic.gov.au.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Deleting your information</h2>
      <p className="mt-3 text-sm leading-relaxed">
        You can ask us to delete your personal information at any time. See our{" "}
        <Link
          href="/data-deletion"
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Data Deletion
        </Link>{" "}
        page for how.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Changes</h2>
      <p className="mt-3 text-sm leading-relaxed">
        We may update this policy. The date at the top shows when it last changed.
      </p>
    </article>
  )
}
