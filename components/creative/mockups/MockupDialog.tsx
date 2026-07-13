"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import type { CreativeAsset } from "@/lib/creative/types"
import { cn } from "@/lib/utils"
import { LivePageMockup } from "./LivePageMockup"
import { MOCK_TEMPLATES, type MockTemplateId, getMockTemplate } from "./mockTemplates"
import { TvSceneMockup } from "./scenes/TvSceneMockup"
import { captureVideoFrameDataUrl } from "./scenes/useVideoFrames"
import {
  SOCIAL_CTA_OPTIONS,
  SocialMockFrames,
  createDefaultSocialAdCopy,
  type SocialAdCopy,
} from "./SocialMockFrames"
import { isHtml5Zip, isVideo } from "./social/shared"
import type { SocialCtaLabel } from "./social/types"
import { WebPageMockTemplates } from "./WebPageMockTemplates"

type AdCopyPlatform = "facebook-feed" | "instagram-feed" | "instagram-story" | "tiktok"

type AdCopyVariant = {
  angle: string
  primaryText: string
  headline: string
  description: string
  cta: SocialCtaLabel
}

type MockupDialogProps = {
  asset: CreativeAsset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultBrandName: string
  clientName?: string
  campaignName?: string
  /** Client Meta page id (`idmeta`) for FB/IG avatars. */
  metaPageId?: string
}

function socialPlatformFromTemplate(templateId: MockTemplateId): AdCopyPlatform | null {
  if (
    templateId === "facebook-feed" ||
    templateId === "instagram-feed" ||
    templateId === "instagram-story" ||
    templateId === "tiktok"
  ) {
    return templateId
  }
  return null
}

function SocialAdForm({
  copy,
  onChange,
  showDescription,
  asset,
  platform,
  clientName,
  campaignName,
}: {
  copy: SocialAdCopy
  onChange: (next: SocialAdCopy) => void
  showDescription: boolean
  asset: CreativeAsset
  platform: AdCopyPlatform
  clientName?: string
  campaignName?: string
}) {
  const { toast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [variants, setVariants] = useState<AdCopyVariant[]>([])
  const [activeVariant, setActiveVariant] = useState(0)

  const patch = <K extends keyof SocialAdCopy>(key: K, value: SocialAdCopy[K]) => {
    onChange({ ...copy, [key]: value })
  }

  async function generateCopy(regenerate: boolean) {
    if (isHtml5Zip(asset.mime_type)) {
      toast({
        title: "Not supported",
        description: "HTML5 zip creatives can't use AVA copy generation.",
        variant: "destructive",
      })
      return
    }

    setGenerating(true)
    try {
      let videoFrameDataUrl: string | undefined
      if (isVideo(asset.mime_type)) {
        videoFrameDataUrl = await captureVideoFrameDataUrl(asset)
      }

      const response = await fetch("/api/creative-assets/ad-copy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.id,
          platform,
          brandName: copy.brandName,
          clientName,
          campaignName,
          videoFrameDataUrl,
          existingCopy: regenerate
            ? {
                primaryText: copy.primaryText,
                headline: copy.headline,
                description: copy.description,
                ctaLabel: copy.ctaLabel,
              }
            : undefined,
        }),
      })

      const data = (await response.json()) as {
        variants?: AdCopyVariant[]
        error?: string
        message?: string
      }

      if (!response.ok) {
        toast({
          title: response.status === 429 ? "Rate limited" : "AVA couldn't write copy",
          description: data.message ?? "Try again in a moment.",
          variant: "destructive",
        })
        return
      }

      if (!data.variants?.length) {
        toast({
          title: "AVA couldn't write copy",
          description: "No variants returned. Try again.",
          variant: "destructive",
        })
        return
      }

      setVariants(data.variants)
      setActiveVariant(0)
      applyVariant(data.variants[0])
    } catch {
      toast({
        title: "AVA couldn't write copy",
        description: "Something went wrong. You can still edit the fields manually.",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  function applyVariant(variant: AdCopyVariant) {
    onChange({
      ...copy,
      primaryText: variant.primaryText,
      headline: variant.headline,
      description: variant.description,
      ctaLabel: variant.cta,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={generating}
          onClick={() => void generateCopy(variants.length > 0)}
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              AVA is writing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" aria-hidden />
              {variants.length > 0 ? "Regenerate with AVA" : "Generate with AVA"}
            </>
          )}
        </Button>
      </div>

      {variants.length > 0 ? (
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant, index) => (
              <Tooltip key={variant.angle + index}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "interactive rounded-pill border border-border bg-card px-3 py-1 text-xs font-medium",
                      index === activeVariant && "ring-2 ring-ring",
                    )}
                    onClick={() => {
                      setActiveVariant(index)
                      applyVariant(variant)
                    }}
                  >
                    Angle {index + 1}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{variant.angle}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="mockup-brand">Page / brand name</Label>
        <Input
          id="mockup-brand"
          value={copy.brandName}
          onChange={(event) => patch("brandName", event.target.value)}
          placeholder="Brand"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-primary">Primary text / caption</Label>
        <Textarea
          id="mockup-primary"
          value={copy.primaryText}
          onChange={(event) => patch("primaryText", event.target.value)}
          placeholder="Write primary text…"
          rows={4}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-headline">Headline</Label>
        <Input
          id="mockup-headline"
          value={copy.headline}
          onChange={(event) => patch("headline", event.target.value)}
          placeholder="Headline"
        />
      </div>

      {showDescription ? (
        <div className="space-y-1.5">
          <Label htmlFor="mockup-description">Description</Label>
          <Input
            id="mockup-description"
            value={copy.description}
            onChange={(event) => patch("description", event.target.value)}
            placeholder="Link description"
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="mockup-display-link">Display link</Label>
        <Input
          id="mockup-display-link"
          value={copy.displayLink}
          onChange={(event) => patch("displayLink", event.target.value)}
          placeholder="assembledmedia.com.au"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-destination">Destination URL</Label>
        <Input
          id="mockup-destination"
          value={copy.destinationUrl}
          onChange={(event) => patch("destinationUrl", event.target.value)}
          placeholder="https://…"
        />
        <p className="text-xs text-muted-foreground">Shown in tooltips only — mockups never navigate.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-cta">CTA label</Label>
        <Select
          value={copy.ctaLabel}
          onValueChange={(value) => patch("ctaLabel", value as SocialCtaLabel)}
        >
          <SelectTrigger id="mockup-cta">
            <SelectValue placeholder="CTA" />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_CTA_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function MockupDialog({
  asset,
  open,
  onOpenChange,
  defaultBrandName,
  clientName,
  campaignName,
  metaPageId,
}: MockupDialogProps) {
  const [templateId, setTemplateId] = useState<MockTemplateId>("facebook-feed")
  const [adCopy, setAdCopy] = useState<SocialAdCopy>(() =>
    createDefaultSocialAdCopy(defaultBrandName),
  )

  const template = getMockTemplate(templateId)
  const isSocial = template.kind === "social"
  const isLive = template.kind === "live"
  const isWebpage = template.kind === "webpage"
  const isScene = template.kind === "scene"
  const socialPlatform = socialPlatformFromTemplate(templateId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && asset) {
          setAdCopy(createDefaultSocialAdCopy(defaultBrandName))
          setTemplateId(
            asset.mime_type === "application/zip" ? "news-article" : "facebook-feed",
          )
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b border-border px-6 py-4 text-left">
          <div>
            <DialogTitle>Creative mockup</DialogTitle>
            <DialogDescription>
              {asset
                ? `Preview “${asset.asset_name}” in social, webpage, TV scene, or live-page frames.`
                : "Preview creative in social, webpage, TV scene, or live-page frames."}
            </DialogDescription>
          </div>

          <div className="overflow-x-auto pb-1">
            <Segmented
              value={templateId}
              onValueChange={(value) => {
                if (!value) return
                setTemplateId(value as MockTemplateId)
              }}
              className="w-max"
            >
              {MOCK_TEMPLATES.map((item) => (
                <SegmentedItem key={item.id} value={item.id}>
                  {item.label}
                </SegmentedItem>
              ))}
            </Segmented>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {isSocial && asset && socialPlatform ? (
            <aside className="shrink-0 overflow-y-auto border-b border-border bg-surface-panel px-4 py-4 lg:w-[320px] lg:border-b-0 lg:border-r">
              <SocialAdForm
                copy={adCopy}
                onChange={setAdCopy}
                showDescription={templateId === "facebook-feed"}
                asset={asset}
                platform={socialPlatform}
                clientName={clientName}
                campaignName={campaignName}
              />
            </aside>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto bg-background px-4 py-6 sm:px-8">
            {asset ? (
              isLive ? (
                <LivePageMockup
                  asset={asset}
                  onUseBuiltInTemplates={() => setTemplateId("news-article")}
                />
              ) : isScene ? (
                <TvSceneMockup asset={asset} />
              ) : isSocial ? (
                <SocialMockFrames
                  templateId={
                    templateId as
                      | "facebook-feed"
                      | "instagram-feed"
                      | "instagram-story"
                      | "tiktok"
                  }
                  copy={adCopy}
                  asset={asset}
                  metaPageId={metaPageId}
                />
              ) : isWebpage ? (
                <WebPageMockTemplates
                  templateId={templateId as "news-article" | "homepage"}
                  asset={asset}
                />
              ) : null
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
