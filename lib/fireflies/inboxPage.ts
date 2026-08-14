/**
 * Inbox list envelope: GET /api/codex/proposals is paginated by meeting group.
 * `pendingCount` is the full proposed set, never the loaded page size.
 */
import { clampPage, clampPerPage } from "@/lib/codex/queryHelpers"

export type InboxPageEnvelope<T> = {
  groups: T[]
  pendingCount: number
  itemsTotal: number
  curPage: number
  pageTotal: number
  nextPage: number | null
  prevPage: number | null
}

export function inboxPageEnvelope<T>(opts: {
  groups: T[]
  pendingCount: number
  itemsTotal: number
  page?: number
  perPage?: number
}): InboxPageEnvelope<T> {
  const perPage = clampPerPage(opts.perPage)
  const curPage = clampPage(opts.page)
  const itemsTotal = Math.max(0, Math.floor(opts.itemsTotal) || 0)
  const pageTotal = Math.max(1, Math.ceil(itemsTotal / perPage) || 1)
  return {
    groups: opts.groups,
    pendingCount: Math.max(0, Math.floor(opts.pendingCount) || 0),
    itemsTotal,
    curPage,
    pageTotal,
    nextPage: curPage < pageTotal ? curPage + 1 : null,
    prevPage: curPage > 1 ? curPage - 1 : null,
  }
}
