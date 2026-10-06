import {
  readAllPublisherKpis,
  readPublisherKpis,
} from "@/lib/data/readKpi"
import {
  createPublisherKpiPostgresFirst,
  deletePublisherKpiPostgresFirst,
  updatePublisherKpiPostgresFirst,
} from "@/lib/data/writeKpi"
import type { PublisherKpi, PublisherKpiInput } from "./types"

/** Route-handler / server only — static import of server-only `readKpi`. */
export async function fetchAllPublisherKpis(): Promise<PublisherKpi[]> {
  return await readAllPublisherKpis()
}

export async function fetchPublisherKpis(
  publisherKey: string,
): Promise<PublisherKpi[]> {
  return await readPublisherKpis(publisherKey)
}

export async function createPublisherKpi(
  input: PublisherKpiInput,
): Promise<PublisherKpi | null> {
  return createPublisherKpiPostgresFirst(input)
}

export async function updatePublisherKpi(
  id: number,
  input: Partial<PublisherKpiInput>,
): Promise<PublisherKpi | null> {
  return updatePublisherKpiPostgresFirst(id, input)
}

export async function deletePublisherKpi(id: number): Promise<boolean> {
  return deletePublisherKpiPostgresFirst(id)
}
