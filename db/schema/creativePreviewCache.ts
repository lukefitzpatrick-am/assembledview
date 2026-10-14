/**
 * creative_preview_cache (migration 0098). Requires 0098 applied.
 * RLS on, no policies, no ava_readonly grant.
 * Do not db.select() this table until 0098 is applied (C-76).
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  bigserial,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const creativePreviewCache = pgTable(
  "creative_preview_cache",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    platform: text("platform").notNull(),
    creativeKey: text("creative_key").notNull(),
    clientId: bigint("client_id", { mode: "number" }).references(() => clients.id),
    blobPathname: text("blob_pathname"),
    mimeType: text("mime_type"),
    width: integer("width"),
    height: integer("height"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "string" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    check(
      "creative_preview_cache_platform_chk",
      sql`${table.platform} in ('meta','tiktok','cm360')`,
    ),
    check(
      "creative_preview_cache_source_chk",
      sql`${table.source} in ('platform','av_library','none')`,
    ),
    unique("creative_preview_cache_platform_key_uq").on(table.platform, table.creativeKey),
  ],
)
