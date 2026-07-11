"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ClipboardCopy, Download, Loader2, RotateCcw } from "lucide-react"

import { BestPracticeRail } from "@/components/trafficking/BestPracticeRail"
import {
  NamingLevelGrid,
  type NamingGridRow,
} from "@/components/trafficking/NamingLevelGrid"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { copyToClipboard } from "@/lib/copyToClipboard"
import { composeName } from "@/lib/naming/compose"
import {
  downloadTraffickingWorkbook,
  formatPlatformBlock,
  tryComposeName,
  type TraffickingExportPlatform,
} from "@/lib/naming/exportTraffickingWorkbook"
import {
  baseRowsForPlatform,
  derivePlatformTabs,
  extractPlanGlobals,
  levelNeedsLineItemSeed,
  templatesForPlatform,
  type PlanGlobals,
  type PlatformTab,
} from "@/lib/naming/fromPlan"
import { PICKLISTS, getTemplate } from "@/lib/naming/templates"
import type { NamingTemplate } from "@/lib/naming/types"
import type { MediaContainerBestPractice } from "@/lib/types/publisher"

type TraffickingBuilderProps = {
  mbaNumber: string
}

type LevelRowsState = Record<string, NamingGridRow[]>

type PlatformState = {
  levels: LevelRowsState
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function defaultPicklistValue(picklistKey: string | undefined): string {
  if (!picklistKey) return ""
  const list = PICKLISTS[picklistKey]
  return list?.[0] ?? ""
}

function seedValuesForTemplate(
  template: NamingTemplate,
  globals: PlanGlobals,
  line?: {
    publisher: string
    media_type: string
    line_item_id: string
    targeting: string
  },
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const el of template.elements) {
    if (el.source === "literal") {
      if (el.literal) values[el.key] = el.literal
      continue
    }
    if (el.source === "picklist") {
      values[el.key] = defaultPicklistValue(el.picklist)
      continue
    }
    if (el.source === "free") {
      values[el.key] = ""
      continue
    }
    // plan
    switch (el.key) {
      case "brand":
        values[el.key] = globals.brand
        break
      case "client":
        values[el.key] = globals.client
        break
      case "campaign":
        values[el.key] = globals.campaign
        break
      case "mba":
        values[el.key] = globals.mba
        break
      case "month_start":
        values[el.key] = globals.month_start
        break
      case "publisher":
        values[el.key] = line?.publisher ?? ""
        break
      case "media_type":
        values[el.key] = line?.media_type ?? ""
        break
      case "line_item_id":
        values[el.key] = line?.line_item_id ?? ""
        break
      case "targeting":
        values[el.key] = line?.targeting ?? ""
        break
      case "campaign_name":
      case "io_name":
      case "creative_name":
        values[el.key] = ""
        break
      default:
        values[el.key] = ""
    }
  }
  return values
}

function buildPlatformState(
  tab: PlatformTab,
  globals: PlanGlobals,
  lineItems: Record<string, unknown[]>,
): PlatformState {
  const templates = templatesForPlatform(tab.platform)
  const baseLines = baseRowsForPlatform(tab.platform, lineItems, tab)
  const levels: LevelRowsState = {}

  for (const template of templates) {
    if (levelNeedsLineItemSeed(template) && baseLines.length > 0) {
      levels[template.level] = baseLines.map((line) => ({
        id: newRowId(),
        isBase: true,
        excluded: false,
        values: seedValuesForTemplate(template, globals, line),
      }))
    } else {
      levels[template.level] = [
        {
          id: newRowId(),
          isBase: true,
          excluded: false,
          values: seedValuesForTemplate(template, globals),
        },
      ]
    }
  }

  return { levels }
}

function buildAllPlatformState(
  tabs: PlatformTab[],
  globals: PlanGlobals,
  lineItems: Record<string, unknown[]>,
): Record<string, PlatformState> {
  const out: Record<string, PlatformState> = {}
  for (const tab of tabs) {
    out[tab.platform] = buildPlatformState(tab, globals, lineItems)
  }
  return out
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}

export function TraffickingBuilder({ mbaNumber }: TraffickingBuilderProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [campaignName, setCampaignName] = useState("")
  const [globals, setGlobals] = useState<PlanGlobals | null>(null)
  const [lineItems, setLineItems] = useState<Record<string, unknown[]>>({})
  const [tabs, setTabs] = useState<PlatformTab[]>([])
  const [activePlatform, setActivePlatform] = useState<string>("")
  const [platformState, setPlatformState] = useState<Record<string, PlatformState>>({})
  const [bestPracticeRows, setBestPracticeRows] = useState<MediaContainerBestPractice[]>([])
  const [railOpen, setRailOpen] = useState(true)
  const [sizeSelectionByLevel, setSizeSelectionByLevel] = useState<Record<string, string[]>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [planRes, bpRes] = await Promise.all([
        fetch(`/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}`),
        fetch("/api/media-container-best-practice"),
      ])

      if (!planRes.ok) {
        throw new Error(await readError(planRes, "Failed to load media plan"))
      }

      const plan = (await planRes.json()) as Record<string, unknown>
      const masterId =
        typeof plan.media_plan_master_id === "number"
          ? plan.media_plan_master_id
          : Number(plan.media_plan_master_id)
      if (!Number.isFinite(masterId) || masterId <= 0) {
        throw new Error("Media plan master id is missing from MBA response")
      }

      const nextGlobals = extractPlanGlobals(plan, mbaNumber)
      if (!nextGlobals.month_start) {
        throw new Error(
          "campaign_start_date is missing or invalid — cannot derive month_start (mmmyy)",
        )
      }
      if (!nextGlobals.brand && !nextGlobals.client) {
        throw new Error("Client/brand name is missing from MBA response")
      }

      const items =
        plan.lineItems && typeof plan.lineItems === "object"
          ? (plan.lineItems as Record<string, unknown[]>)
          : {}

      const nextTabs = derivePlatformTabs(items)
      const nextState = buildAllPlatformState(nextTabs, nextGlobals, items)

      setGlobals(nextGlobals)
      setLineItems(items)
      setTabs(nextTabs)
      setPlatformState(nextState)
      setCampaignName(
        String(plan.mp_campaignname || plan.campaign_name || "").trim() || mbaNumber,
      )
      setActivePlatform((prev) =>
        nextTabs.some((t) => t.platform === prev) ? prev : (nextTabs[0]?.platform ?? ""),
      )
      setSizeSelectionByLevel({})

      if (bpRes.ok) {
        const bpData = (await bpRes.json()) as unknown
        setBestPracticeRows(Array.isArray(bpData) ? (bpData as MediaContainerBestPractice[]) : [])
      } else {
        setBestPracticeRows([])
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load trafficking builder"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [mbaNumber, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeTab = tabs.find((t) => t.platform === activePlatform) ?? tabs[0]

  const resolveComposites = useCallback(
    (platform: string, values: Record<string, string>): Record<string, string> => {
      const out: Record<string, string> = {}
      const campaignTpl = getTemplate(platform, "campaign")
      if (campaignTpl) {
        try {
          const campaignRows = platformState[platform]?.levels.campaign
          const seed = campaignRows?.find((r) => !r.excluded) ?? campaignRows?.[0]
          const merged: Record<string, string> = { ...(seed?.values ?? {}) }
          for (const el of campaignTpl.elements) {
            if (el.source === "literal" && el.literal) merged[el.key] = el.literal
            if (el.source === "picklist" && !merged[el.key]) {
              merged[el.key] = defaultPicklistValue(el.picklist)
            }
            if (el.source === "plan" && !merged[el.key] && values[el.key]) {
              merged[el.key] = values[el.key]
            }
          }
          out.campaign_name = composeName(campaignTpl, merged)
        } catch {
          // leave unset — compose will withhold
        }
      }

      const ioTpl =
        getTemplate(platform, "insertion_order") ?? getTemplate(platform, "package")
      if (ioTpl) {
        try {
          const ioRows =
            platformState[platform]?.levels.insertion_order ??
            platformState[platform]?.levels.package
          const seed = ioRows?.find((r) => !r.excluded) ?? ioRows?.[0]
          // Prefer the child row's media_type/targeting when composing io_name for an ad
          const merged: Record<string, string> = {
            ...(seed?.values ?? {}),
            media_type: values.media_type || seed?.values.media_type || "",
            targeting: values.targeting || seed?.values.targeting || "",
            publisher: values.publisher || seed?.values.publisher || "",
          }
          for (const el of ioTpl.elements) {
            if (el.source === "literal" && el.literal) merged[el.key] = el.literal
            if (el.source === "picklist" && !merged[el.key]) {
              merged[el.key] = defaultPicklistValue(el.picklist)
            }
          }
          out.io_name = composeName(ioTpl, merged)
        } catch {
          // leave unset
        }
      }

      return out
    },
    [platformState],
  )

  const updateRowValue = (level: string, rowId: string, key: string, value: string) => {
    if (!activeTab) return
    setPlatformState((prev) => {
      const platform = activeTab.platform
      const current = prev[platform]
      if (!current) return prev
      const rows = current.levels[level] ?? []
      return {
        ...prev,
        [platform]: {
          levels: {
            ...current.levels,
            [level]: rows.map((row) =>
              row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row,
            ),
          },
        },
      }
    })
  }

  const duplicateRow = (level: string, rowId: string) => {
    if (!activeTab) return
    setPlatformState((prev) => {
      const platform = activeTab.platform
      const current = prev[platform]
      if (!current) return prev
      const rows = current.levels[level] ?? []
      const source = rows.find((r) => r.id === rowId)
      if (!source) return prev
      const copy: NamingGridRow = {
        id: newRowId(),
        isBase: false,
        excluded: false,
        values: { ...source.values },
      }
      const idx = rows.findIndex((r) => r.id === rowId)
      const next = [...rows]
      next.splice(idx + 1, 0, copy)
      return {
        ...prev,
        [platform]: {
          levels: { ...current.levels, [level]: next },
        },
      }
    })
  }

  const deleteRow = (level: string, rowId: string) => {
    if (!activeTab) return
    setPlatformState((prev) => {
      const platform = activeTab.platform
      const current = prev[platform]
      if (!current) return prev
      const rows = current.levels[level] ?? []
      return {
        ...prev,
        [platform]: {
          levels: {
            ...current.levels,
            [level]: rows.filter((r) => r.id !== rowId || r.isBase),
          },
        },
      }
    })
  }

  const toggleExcluded = (level: string, rowId: string, excluded: boolean) => {
    if (!activeTab) return
    setPlatformState((prev) => {
      const platform = activeTab.platform
      const current = prev[platform]
      if (!current) return prev
      return {
        ...prev,
        [platform]: {
          levels: {
            ...current.levels,
            [level]: (current.levels[level] ?? []).map((row) =>
              row.id === rowId ? { ...row, excluded } : row,
            ),
          },
        },
      }
    })
  }

  const expandSizes = (level: string) => {
    if (!activeTab) return
    const key = `${activeTab.platform}:${level}`
    const sizes = sizeSelectionByLevel[key] ?? []
    if (sizes.length === 0) return

    setPlatformState((prev) => {
      const platform = activeTab.platform
      const current = prev[platform]
      if (!current) return prev
      const rows = current.levels[level] ?? []
      const seed = rows.find((r) => !r.excluded) ?? rows[0]
      if (!seed) return prev

      const expanded: NamingGridRow[] = sizes.map((size) => ({
        id: newRowId(),
        isBase: false,
        excluded: false,
        values: { ...seed.values, size },
      }))

      return {
        ...prev,
        [platform]: {
          levels: {
            ...current.levels,
            [level]: [...rows, ...expanded],
          },
        },
      }
    })
  }

  const resetToPlan = () => {
    if (!globals) return
    const nextTabs = derivePlatformTabs(lineItems)
    setTabs(nextTabs)
    setPlatformState(buildAllPlatformState(nextTabs, globals, lineItems))
    setSizeSelectionByLevel({})
    toast({ title: "Reset", description: "Rows regenerated from the media plan." })
  }

  const mergeRowForCompose = useCallback(
    (
      platform: string,
      template: NamingTemplate,
      row: NamingGridRow,
    ): Record<string, string> => {
      const merged: Record<string, string> = {
        ...row.values,
        ...resolveComposites(platform, row.values),
      }
      for (const el of template.elements) {
        if (el.source === "literal" && el.literal) {
          merged[el.key] = el.literal
        }
      }
      return merged
    },
    [resolveComposites],
  )

  const copyPlatformBlock = async (tab: PlatformTab) => {
    const templates = templatesForPlatform(tab.platform)
    const levels = templates.map((template) => {
      const rows = platformState[tab.platform]?.levels[template.level] ?? []
      const names: string[] = []
      for (const row of rows) {
        if (row.excluded) continue
        const merged = mergeRowForCompose(tab.platform, template, row)
        const attempt = tryComposeName(template, merged)
        if (attempt.ok) names.push(attempt.name)
      }
      return { level: template.level, names }
    })
    const text = formatPlatformBlock(levels)
    const ok = await copyToClipboard(text)
    if (!ok) {
      toast({
        title: "Copy failed",
        description: "Clipboard is unavailable in this browser context.",
        variant: "destructive",
      })
      return
    }
    const total = levels.reduce((n, l) => n + l.names.length, 0)
    toast({
      title: "Copied",
      description: `Platform block (${total} names)`,
    })
  }

  const [exporting, setExporting] = useState(false)

  const downloadWorkbook = async () => {
    if (!globals) return
    setExporting(true)
    try {
      const seenIds = new Set<string>()
      const inputRows = tabs.flatMap((tab) =>
        baseRowsForPlatform(tab.platform, lineItems, tab).filter((row) => {
          if (seenIds.has(row.line_item_id)) return false
          seenIds.add(row.line_item_id)
          return true
        }),
      )

      const platforms: TraffickingExportPlatform[] = tabs.map((tab) => ({
        platform: tab.platform,
        levels: templatesForPlatform(tab.platform).map((template) => {
          const rows = platformState[tab.platform]?.levels[template.level] ?? []
          return {
            template,
            rows: rows.map((row) => ({
              values: mergeRowForCompose(tab.platform, template, row),
              excluded: row.excluded,
            })),
          }
        }),
      }))

      const filename = await downloadTraffickingWorkbook({
        globals,
        inputRows,
        platforms,
      })
      toast({ title: "Downloaded", description: filename })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to build workbook"
      toast({ title: "Export failed", description: message, variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        Loading trafficking builder…
      </div>
    )
  }

  if (!globals) {
    return (
      <div className="rounded-card border border-destructive/40 bg-pacing-critical-bg px-4 py-3 text-status-critical-fg">
        Unable to load plan globals for this MBA.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MediaPlanEditorHero
        title={campaignName || "Trafficking"}
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
        actions={
          <>
            <Button variant="outline" size="sm" type="button" className="text-xs" asChild>
              <Link href={`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/creative`}>
                Creative
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="text-xs"
              disabled={exporting || tabs.length === 0}
              onClick={() => void downloadWorkbook()}
            >
              {exporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Download workbook
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="text-xs"
              onClick={resetToPlan}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Reset to plan
            </Button>
          </>
        }
      />

      {tabs.length === 0 ? (
        <div className="rounded-card border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-e1">
          No digital channels with line items on this plan. Add social, search, programmatic, or
          digital line items to generate naming grids.
        </div>
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="min-w-0 flex-1 space-y-4">
            <Tabs
              value={activePlatform || tabs[0]?.platform}
              onValueChange={setActivePlatform}
            >
              <TabsList className="w-full flex-wrap justify-start gap-4">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.platform} value={tab.platform}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {tabs.map((tab) => (
                <TabsContent key={tab.platform} value={tab.platform} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {tab.mappingLabels.join(" · ")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => void copyPlatformBlock(tab)}
                    >
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Copy platform block
                    </Button>
                  </div>

                  {templatesForPlatform(tab.platform).map((template) => {
                    const levelKey = `${tab.platform}:${template.level}`
                    const rows = platformState[tab.platform]?.levels[template.level] ?? []
                    return (
                      <NamingLevelGrid
                        key={template.level}
                        template={template}
                        rows={rows}
                        resolveComposites={(values) =>
                          resolveComposites(tab.platform, values)
                        }
                        sizeSelection={sizeSelectionByLevel[levelKey] ?? []}
                        onSizeSelectionChange={(sizes) =>
                          setSizeSelectionByLevel((prev) => ({ ...prev, [levelKey]: sizes }))
                        }
                        onExpandSizes={() => expandSizes(template.level)}
                        onChangeValue={(rowId, key, value) =>
                          updateRowValue(template.level, rowId, key, value)
                        }
                        onDuplicate={(rowId) => duplicateRow(template.level, rowId)}
                        onDelete={(rowId) => deleteRow(template.level, rowId)}
                        onToggleExcluded={(rowId, excluded) =>
                          toggleExcluded(template.level, rowId, excluded)
                        }
                      />
                    )
                  })}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <aside className="w-full shrink-0 xl:w-80">
            <div className="xl:sticky xl:top-4">
              <BestPracticeRail
                channelKeys={activeTab?.channelKeys ?? []}
                rows={bestPracticeRows}
                open={railOpen}
                onOpenChange={setRailOpen}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
