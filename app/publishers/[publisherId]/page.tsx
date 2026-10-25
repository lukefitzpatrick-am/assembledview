import { notFound } from "next/navigation"
import { getPublisherByPublisherId, getPublisherMarketShare } from "@/lib/api/publishers"
import { getPublisherDashboardData } from "@/lib/api/dashboard"
import { normalizePublisherRecord } from "@/lib/publisher/normalizePublisher"
import { PublisherDetailClient } from "./PublisherDetailClient"

interface PageProps {
  params: Promise<{ publisherId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PublisherDetailPage({ params, searchParams }: PageProps) {
  const { publisherId } = await params
  // `?pk=` opens one record by primary key while two publishers still share a
  // publisherid (links from the duplicates banner on /publishers).
  const pkParam = (await searchParams).pk
  const pk = Number(Array.isArray(pkParam) ? pkParam[0] : pkParam)
  const raw = await getPublisherByPublisherId(publisherId, {
    rowId: Number.isInteger(pk) && pk > 0 ? pk : null,
  })
  if (!raw) {
    notFound()
  }

  const publisher = normalizePublisherRecord(raw)
  const [analytics, shareByMediaType] = await Promise.all([
    getPublisherDashboardData(publisher),
    getPublisherMarketShare(publisher.id),
  ])

  return (
    <PublisherDetailClient
      initialPublisher={publisher}
      analytics={{ ...analytics, shareByMediaType }}
    />
  )
}
