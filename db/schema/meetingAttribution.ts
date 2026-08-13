/**
 * publisher_domains + meeting_title_rules (migration 0043).
 * Learned on Fireflies assign — never seed vendor domains.
 * RLS on; no ava_readonly grant. Owner path only.
 */
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

export const publisherDomains = pgTable(
  "publisher_domains",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    publisherId: bigint("publisher_id", { mode: "number" })
      .notNull()
      .references(() => publishers.id),
    emailDomain: text("email_domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("publisher_domains_email_domain_unique").on(table.emailDomain),
    index("idx_publisher_domains_publisher_id").on(table.publisherId),
  ],
)

export const meetingTitleRules = pgTable(
  "meeting_title_rules",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    normalizedTitle: text("normalized_title").notNull(),
    targetType: text("target_type").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("meeting_title_rules_normalized_title_unique").on(
      table.normalizedTitle,
    ),
  ],
)
