import "server-only"

import { desc, eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { listCampaignInsights } from "@/lib/insights/queryCampaignInsights"
import type { CampaignDetailNote } from "./types"

export async function listCampaignDetailNotes(mbaNumber: string): Promise<CampaignDetailNote[]> {
  const mba = mbaNumber.trim()
  const [insights, comments] = await Promise.all([
    listCampaignInsights({ mbaNumber: mba, limit: 10 }).catch(() => []),
    listMbaTaskComments(mba).catch(() => []),
  ])
  const notes: CampaignDetailNote[] = [
    ...insights.map((row) => ({
      id: `insight:${row.id}`,
      at: row.createdAt,
      author: row.createdBy || "Unknown",
      body: row.body,
      source: "insight" as const,
    })),
    ...comments,
  ]
  return notes
    .toSorted((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10)
}

async function listMbaTaskComments(mbaNumber: string): Promise<CampaignDetailNote[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.taskComments.id,
      body: schema.taskComments.body,
      createdAt: schema.taskComments.createdAt,
      authorName: schema.taskComments.authorName,
      authorEmail: schema.taskComments.authorEmail,
    })
    .from(schema.taskComments)
    .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskComments.taskId))
    .where(eq(schema.tasks.mbaNumber, mbaNumber))
    .orderBy(desc(schema.taskComments.createdAt))
    .limit(10)
  return rows.map((row) => ({
    id: `comment:${row.id}`,
    at: row.createdAt,
    author: row.authorName?.trim() || row.authorEmail?.trim() || "Unknown",
    body: row.body ?? "",
    source: "comment" as const,
  }))
}
