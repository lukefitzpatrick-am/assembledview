"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"

import { CreativeAssetTable } from "@/components/creative/CreativeAssetTable"
import { CreativeUploadZone } from "@/components/creative/CreativeUploadZone"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { flattenLineItemOptions, type LineItemOption } from "@/lib/creative/lineItemOptions"
import type { CreativeAsset } from "@/lib/creative/types"

type CreativeAssetManagerProps = {
  mbaNumber: string
  showPageHeader?: boolean
}

type MediaPlanPayload = {
  media_plan_master_id?: number
  mp_campaignname?: string
  campaign_name?: string
  lineItems?: Record<string, unknown[]>
}

type StatusFilter = "all" | "active" | "archived"

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}

export function CreativeAssetManager({ mbaNumber, showPageHeader = false }: CreativeAssetManagerProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [assets, setAssets] = useState<CreativeAsset[]>([])
  const [lineItemOptions, setLineItemOptions] = useState<LineItemOption[]>([])
  const [mediaPlanMasterId, setMediaPlanMasterId] = useState<number | null>(null)
  const [campaignName, setCampaignName] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [nameFilter, setNameFilter] = useState("")
  const [uploadLineItemKey, setUploadLineItemKey] = useState("none")

  const uploadLineItemLink = useMemo(() => {
    if (uploadLineItemKey === "none") return null
    return lineItemOptions.find(
      (option) => `${option.source_table}:${option.line_item_id}` === uploadLineItemKey,
    ) ?? null
  }, [lineItemOptions, uploadLineItemKey])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [assetsRes, planRes] = await Promise.all([
        fetch(`/api/creative-assets?mba_number=${encodeURIComponent(mbaNumber)}`),
        fetch(`/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}`),
      ])

      if (!assetsRes.ok) {
        throw new Error(await readError(assetsRes, "Failed to load creative assets"))
      }
      if (!planRes.ok) {
        throw new Error(await readError(planRes, "Failed to load media plan"))
      }

      const assetRows = (await assetsRes.json()) as CreativeAsset[]
      const plan = (await planRes.json()) as MediaPlanPayload

      const masterId =
        typeof plan.media_plan_master_id === "number"
          ? plan.media_plan_master_id
          : Number(plan.media_plan_master_id)
      if (!Number.isFinite(masterId) || masterId <= 0) {
        throw new Error("Media plan master id is missing from MBA response")
      }

      setAssets(Array.isArray(assetRows) ? assetRows : [])
      setMediaPlanMasterId(masterId)
      setCampaignName(
        String(plan.mp_campaignname || plan.campaign_name || "").trim() || mbaNumber,
      )
      setLineItemOptions(flattenLineItemOptions(plan.lineItems))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load creative assets"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [mbaNumber, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredAssets = useMemo(() => {
    const query = nameFilter.trim().toLowerCase()
    return assets
      .filter((asset) => {
        if (statusFilter === "active") return asset.status === "active"
        if (statusFilter === "archived") return asset.status === "archived"
        return true
      })
      .filter((asset) => {
        if (!query) return true
        return (
          asset.asset_name.toLowerCase().includes(query) ||
          asset.original_filename.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
  }, [assets, nameFilter, statusFilter])

  const patchAsset = useCallback(
    async (id: number, body: Record<string, unknown>, successMessage: string) => {
      const response = await fetch(`/api/creative-assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(await readError(response, "Update failed"))
      }
      const updated = (await response.json()) as CreativeAsset
      setAssets((prev) => prev.map((row) => (row.id === id ? updated : row)))
      toast({ title: "Saved", description: successMessage })
    },
    [toast],
  )

  const handleRename = useCallback(
    async (id: number, assetName: string) => {
      try {
        await patchAsset(id, { asset_name: assetName }, "Asset name updated.")
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Rename failed",
          variant: "destructive",
        })
        throw error
      }
    },
    [patchAsset, toast],
  )

  const handleLineItemChange = useCallback(
    async (id: number, link: Pick<LineItemOption, "line_item_id" | "source_table"> | null) => {
      try {
        await patchAsset(
          id,
          {
            line_item_id: link?.line_item_id ?? "",
            source_table: link?.source_table ?? "",
          },
          "Line item link updated.",
        )
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Line item update failed",
          variant: "destructive",
        })
      }
    },
    [patchAsset, toast],
  )

  const handleStatusToggle = useCallback(
    async (id: number, status: CreativeAsset["status"]) => {
      try {
        await patchAsset(
          id,
          { status },
          status === "archived" ? "Asset archived." : "Asset restored.",
        )
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Status update failed",
          variant: "destructive",
        })
      }
    },
    [patchAsset, toast],
  )

  const handleDelete = useCallback(
    async (id: number) => {
      const response = await fetch(`/api/creative-assets/${id}`, { method: "DELETE" })
      if (!response.ok) {
        toast({
          title: "Error",
          description: await readError(response, "Delete failed"),
          variant: "destructive",
        })
        return
      }
      setAssets((prev) => prev.filter((row) => row.id !== id))
      toast({ title: "Deleted", description: "Creative asset removed." })
    },
    [toast],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        Loading creative assets…
      </div>
    )
  }

  if (!mediaPlanMasterId) {
    return (
      <div className="rounded-card border border-destructive/40 bg-pacing-critical-bg px-4 py-3 text-status-critical-fg">
        Unable to load media plan master id for this MBA.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showPageHeader ? (
        <MediaPlanEditorHero
          title={campaignName || "Creative assets"}
          detail={
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>MBA {mbaNumber}</p>
              <Button variant="link" className="h-auto p-0 text-sm" asChild>
                <Link href={`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit`}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Back to edit campaign
                </Link>
              </Button>
            </div>
          }
        />
      ) : null}

      <Card className="shadow-e1">
        <CardHeader>
          <CardTitle className="text-base">Upload assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Link uploads to line item (optional)</p>
            <Select value={uploadLineItemKey} onValueChange={setUploadLineItemKey}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {lineItemOptions.map((option) => (
                  <SelectItem
                    key={`${option.source_table}:${option.line_item_id}`}
                    value={`${option.source_table}:${option.line_item_id}`}
                  >
                    {option.line_item_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CreativeUploadZone
            mbaNumber={mbaNumber}
            mediaPlanMasterId={mediaPlanMasterId}
            lineItemLink={uploadLineItemLink}
            onAssetRegistered={() => void loadData()}
            onError={(message) => toast({ title: "Upload failed", description: message, variant: "destructive" })}
          />
        </CardContent>
      </Card>

      <Card className="shadow-e1">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Campaign assets</CardTitle>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Filter by name…"
              className="sm:w-56"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <CreativeAssetTable
            assets={filteredAssets}
            lineItemOptions={lineItemOptions}
            onRename={handleRename}
            onLineItemChange={handleLineItemChange}
            onStatusToggle={handleStatusToggle}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
    </div>
  )
}
