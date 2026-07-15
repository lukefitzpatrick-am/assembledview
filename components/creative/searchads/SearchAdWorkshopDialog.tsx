"use client"

import { useState } from "react"

import { GoogleSerpAd } from "@/components/creative/searchads/GoogleSerpAd"
import { SearchCopyChatPanel } from "@/components/creative/searchads/SearchCopyChatPanel"
import {
  createDefaultSearchAdCopy,
  type SearchAdCopy,
  type SearchAdFormat,
  type SearchLimits,
} from "@/components/creative/searchads/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import { Textarea } from "@/components/ui/textarea"
import { SEARCH_LIMITS_PMAX } from "@/lib/creative/searchCopy/limits"
import type { LineItemOption } from "@/lib/creative/lineItemOptions"

type ComplianceCategory = "none" | "financial" | "alcohol" | "health"

type SearchAdWorkshopDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mbaNumber: string
  clientName?: string
  campaignName?: string
  brandName: string
  searchLineItems: LineItemOption[]
  /** RSA limits from entry point; PMax swaps in SEARCH_LIMITS_PMAX by format. */
  limits: SearchLimits
}

function resetWorkshopState() {
  return {
    format: "rsa" as SearchAdFormat,
    adGroup: "",
    keywords: "",
    complianceCategory: "none" as ComplianceCategory,
    copy: createDefaultSearchAdCopy("rsa", ""),
  }
}

export function SearchAdWorkshopDialog({
  open,
  onOpenChange,
  mbaNumber,
  clientName,
  campaignName,
  brandName,
  searchLineItems,
  limits,
}: SearchAdWorkshopDialogProps) {
  const [format, setFormat] = useState<SearchAdFormat>("rsa")
  const [adGroup, setAdGroup] = useState("")
  const [keywords, setKeywords] = useState("")
  const [complianceCategory, setComplianceCategory] =
    useState<ComplianceCategory>("none")
  const [copy, setCopy] = useState<SearchAdCopy>(() =>
    createDefaultSearchAdCopy("rsa", ""),
  )

  const activeLimits = format === "pmax" ? SEARCH_LIMITS_PMAX : limits

  function handleFormatChange(nextFormat: SearchAdFormat) {
    if (nextFormat === format) return
    const next = createDefaultSearchAdCopy(nextFormat, copy.finalUrl)
    setFormat(nextFormat)
    setCopy({
      ...next,
      finalUrl: copy.finalUrl,
      path1: copy.path1,
      path2: copy.path2,
    })
  }

  function patchCopy(partial: Partial<SearchAdCopy>) {
    setCopy((prev) => ({ ...prev, ...partial }))
  }

  function renderAdGroupCard(opts?: { className?: string; idSuffix?: string }) {
    const className =
      opts?.className
      ?? "w-full shrink-0 rounded-card border border-border bg-card p-4 shadow-e1"
    const suffix = opts?.idSuffix ?? "main"
    return (
      <aside className={className}>
        <p className="mb-3 text-sm font-medium text-foreground">Ad group</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Format</Label>
            <Segmented
              value={format}
              onValueChange={(value) => {
                if (!value) return
                handleFormatChange(value as SearchAdFormat)
              }}
              className="w-full"
            >
              <SegmentedItem value="rsa" className="flex-1 text-[11px]">
                RSA
              </SegmentedItem>
              <SegmentedItem value="pmax" className="flex-1 text-[11px]">
                PMax
              </SegmentedItem>
            </Segmented>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`search-workshop-adgroup-${suffix}`}>Ad group name</Label>
            <Input
              id={`search-workshop-adgroup-${suffix}`}
              value={adGroup}
              onChange={(event) => setAdGroup(event.target.value)}
              placeholder="Brand — Exact"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`search-workshop-keywords-${suffix}`}>Keywords</Label>
            <Textarea
              id={`search-workshop-keywords-${suffix}`}
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder="One keyword per line…"
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`search-workshop-final-url-${suffix}`}>Final URL</Label>
            <Input
              id={`search-workshop-final-url-${suffix}`}
              value={copy.finalUrl}
              onChange={(event) => patchCopy({ finalUrl: event.target.value })}
              placeholder="https://…"
            />
          </div>

          {format === "rsa" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`search-workshop-path1-${suffix}`}>Display Path 1</Label>
                <Input
                  id={`search-workshop-path1-${suffix}`}
                  value={copy.path1}
                  onChange={(event) => patchCopy({ path1: event.target.value })}
                  placeholder="path"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`search-workshop-path2-${suffix}`}>Display Path 2</Label>
                <Input
                  id={`search-workshop-path2-${suffix}`}
                  value={copy.path2}
                  onChange={(event) => patchCopy({ path2: event.target.value })}
                  placeholder="path"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`search-workshop-compliance-${suffix}`}>
              Compliance category
            </Label>
            <Select
              value={complianceCategory}
              onValueChange={(value) =>
                setComplianceCategory(value as ComplianceCategory)
              }
            >
              <SelectTrigger id={`search-workshop-compliance-${suffix}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">none</SelectItem>
                <SelectItem value="financial">financial</SelectItem>
                <SelectItem value="alcohol">alcohol</SelectItem>
                <SelectItem value="health">health</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </aside>
    )
  }

  function renderChatPanel(panelClassName?: string) {
    return (
      <SearchCopyChatPanel
        mbaNumber={mbaNumber}
        format={format}
        copy={copy}
        onChange={setCopy}
        limits={activeLimits}
        clientName={clientName}
        campaignName={campaignName}
        brandName={brandName}
        adGroup={adGroup || undefined}
        keywords={keywords || undefined}
        complianceCategory={complianceCategory}
        searchLineItems={searchLineItems}
        className={panelClassName}
      />
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const initial = resetWorkshopState()
          setFormat(initial.format)
          setAdGroup(initial.adGroup)
          setKeywords(initial.keywords)
          setComplianceCategory(initial.complianceCategory)
          setCopy(initial.copy)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b border-border px-6 py-4 text-left">
          <div>
            <DialogTitle>Search ad workshop</DialogTitle>
            <DialogDescription>
              Write and preview Google Search ads for this campaign.
            </DialogDescription>
          </div>

          <div className="overflow-x-auto pb-1">
            <Segmented
              value={format}
              onValueChange={(value) => {
                if (!value) return
                handleFormatChange(value as SearchAdFormat)
              }}
              className="w-max"
            >
              <SegmentedItem value="rsa">Responsive Search Ad</SegmentedItem>
              <SegmentedItem value="pmax">Performance Max</SegmentedItem>
            </Segmented>
          </div>
        </DialogHeader>

        {/* xl+: three floating cards */}
        <div className="hidden min-h-0 flex-1 overflow-auto bg-background px-4 py-6 xl:block sm:px-8">
          <div className="flex items-start justify-center gap-6">
            {renderAdGroupCard({
              className:
                "w-[300px] shrink-0 rounded-card border border-border bg-card p-4 shadow-e1",
              idSuffix: "xl",
            })}

            <div className="min-w-0 max-w-xl flex-1 rounded-card border border-border bg-card p-4 shadow-e1">
              <GoogleSerpAd copy={copy} limits={activeLimits} />
            </div>

            <aside className="flex max-h-[80vh] w-[400px] shrink-0 flex-col overflow-hidden rounded-card border border-border bg-card shadow-e1">
              {renderChatPanel("max-h-[80vh]")}
            </aside>
          </div>
        </div>

        {/* Below xl: stacked */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto xl:hidden">
          <div className="space-y-4 bg-background px-4 py-4 sm:px-6">
            {renderAdGroupCard({ idSuffix: "stack" })}
            <div className="rounded-card border border-border bg-card p-4 shadow-e1">
              <GoogleSerpAd copy={copy} limits={activeLimits} />
            </div>
          </div>
          <aside className="flex min-h-[50vh] w-full shrink-0 flex-col border-t border-border bg-surface-panel">
            {renderChatPanel()}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}
