"use client"

import { useMemo } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { publisherHubPath } from "@/lib/publisher/publisherHubPath"
import { listPublisherDuplicates } from "@/lib/publisher/publisherUniqueness"
import type { Publisher } from "@/lib/types/publisher"

/**
 * Lists publishers that share a name or publisherid (case and spaces
 * ignored). Publisher names and ids must be unique; this is the clean-up list.
 * Each link opens that exact record by primary key (`?pk=`), because the hub
 * URL alone cannot tell two rows with the same publisherid apart.
 */
export function PublisherDuplicatesBanner({ publishers }: { publishers: Publisher[] }) {
  const groups = useMemo(() => listPublisherDuplicates(publishers), [publishers])
  if (groups.length === 0) return null

  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle>
        {groups.length === 1 ? "1 duplicate publisher to fix" : `${groups.length} duplicate publishers to fix`}
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          Two publishers must never share a name or a publisher ID. Rename or retire one record in each group
          below. Until then billing matches use the lowest record number.
        </p>
        <ul className="space-y-1">
          {groups.map((group) => (
            <li key={`${group.field}:${group.key}`}>
              <span className="font-medium">
                {group.field === "publisher_name" ? "Name" : "Publisher ID"} &ldquo;{group.key}&rdquo;:
              </span>{" "}
              {group.publishers.map((p, i) => (
                <span key={String(p.id)}>
                  {i > 0 ? ", " : null}
                  <Link className="underline underline-offset-2" href={`${publisherHubPath(p)}?pk=${p.id}`}>
                    #{p.id} {String(p.publisher_name ?? "").trim()} ({String(p.publisherid ?? "").trim()}
                    {p.billingagency ? `, ${p.billingagency}` : ""})
                  </Link>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
