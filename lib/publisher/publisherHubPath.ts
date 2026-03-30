import type { Publisher } from "@/lib/types/publisher"

/** Path segment for publisher hub + API routes (Xano `publisherid`). */
export function publisherRecordPathSegment(publisher: Pick<Publisher, "publisherid">): string {
  return encodeURIComponent(String(publisher.publisherid ?? "").trim())
}

export function publisherHubPath(publisher: Pick<Publisher, "publisherid">): string {
  return `/publishers/${publisherRecordPathSegment(publisher)}`
}

export function publisherApiRecordPath(publisher: Pick<Publisher, "publisherid">): string {
  return `/api/publishers/${publisherRecordPathSegment(publisher)}`
}
