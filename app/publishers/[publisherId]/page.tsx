import { notFound } from "next/navigation"
import { getPublisherByPublisherId, getPublisherMarketShare } from "@/lib/api/publishers"
import { getPublisherDashboardData } from "@/lib/api/dashboard"
import { normalizePublisherRecord } from "@/lib/publisher/normalizePublisher"
import { PublisherDetailClient } from "./PublisherDetailClient"

interface PageProps {
  params: Promise<{ publisherId: string }>
}

export default async function PublisherDetailPage({ params }: PageProps) {
  const { publisherId } = await params
  const raw = await getPublisherByPublisherId(publisherId)
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
