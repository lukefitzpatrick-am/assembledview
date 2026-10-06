export const LEGAL_ENTITY_NAME = "[TO CONFIRM]"
export const ABN = "[TO CONFIRM]"
export const PRIVACY_EMAIL = "[TO CONFIRM]"
export const POSTAL_ADDRESS = "[TO CONFIRM]"
export const LAST_UPDATED = "6 October 2026"
export const RETENTION_TEXT = "[TO CONFIRM]"

export type ServiceProvider = {
  name: string
  purpose: string
  location: string
}

export const SERVICE_PROVIDERS: readonly ServiceProvider[] = [
  {
    name: "Supabase",
    purpose: "application database",
    location: "Sydney, Australia",
  },
  {
    name: "Vercel",
    purpose: "application hosting and file storage",
    location: "Australia and global edge network, including the United States",
  },
  {
    name: "Auth0 (Okta)",
    purpose: "sign-in and identity",
    location: "[TO CONFIRM region]",
  },
  {
    name: "Twilio SendGrid",
    purpose: "account invitations and email notifications",
    location: "United States",
  },
  {
    name: "Snowflake",
    purpose: "advertising performance data warehouse",
    location: "[TO CONFIRM region]",
  },
  {
    name: "Fivetran",
    purpose: "moves advertising platform reporting into our warehouse",
    location: "United States",
  },
  {
    name: "Anthropic",
    purpose: "AI assistant features (AVA)",
    location: "United States",
  },
  {
    name: "Fireflies.ai",
    purpose: "meeting notes and transcripts for internal users",
    location: "United States",
  },
  {
    name: "Microsoft 365",
    purpose: "email, Teams and document integration",
    location: "per our Microsoft tenant",
  },
  {
    name: "Xero",
    purpose: "invoicing and accounts",
    location: "Australia and overseas",
  },
  {
    name: "Google (Analytics 4, Search Console, BigQuery)",
    purpose: "client website reporting",
    location: "Australia (australia-southeast1) and the United States",
  },
  {
    name: "My Hours",
    purpose: "staff time tracking",
    location: "[TO CONFIRM region]",
  },
]

const UNCONFIRMED = "[TO CONFIRM]"

/** Logs when a production build still ships placeholder legal facts. Does not throw. */
function warnUnconfirmedPrivacyFacts(): void {
  if (process.env.VERCEL_ENV !== "production") return

  const pending: string[] = []
  const scalars: Array<[string, string]> = [
    ["LEGAL_ENTITY_NAME", LEGAL_ENTITY_NAME],
    ["ABN", ABN],
    ["PRIVACY_EMAIL", PRIVACY_EMAIL],
    ["POSTAL_ADDRESS", POSTAL_ADDRESS],
    ["LAST_UPDATED", LAST_UPDATED],
    ["RETENTION_TEXT", RETENTION_TEXT],
  ]
  for (const [label, value] of scalars) {
    if (value.includes(UNCONFIRMED)) pending.push(label)
  }
  for (const provider of SERVICE_PROVIDERS) {
    if (
      provider.name.includes(UNCONFIRMED) ||
      provider.purpose.includes(UNCONFIRMED) ||
      provider.location.includes(UNCONFIRMED)
    ) {
      pending.push(provider.name)
    }
  }
  if (pending.length === 0) return
  console.warn(
    `[privacy] production build still has unconfirmed privacy facts: ${pending.join(", ")}`,
  )
}

warnUnconfirmedPrivacyFacts()
