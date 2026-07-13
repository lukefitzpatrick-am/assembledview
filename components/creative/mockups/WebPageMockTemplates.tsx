"use client"

import type { CreativeAsset } from "@/lib/creative/types"
import { cn } from "@/lib/utils"
import type { AdSlot, MockTemplateId } from "./mockTemplates"
import { getMockTemplate } from "./mockTemplates"

type WebPageMockTemplatesProps = {
  templateId: Extract<MockTemplateId, "news-article" | "homepage">
  asset: CreativeAsset
}

function isImage(mime: string) {
  return mime.startsWith("image/")
}

function isVideo(mime: string) {
  return mime.startsWith("video/")
}

function isHtml5Zip(mime: string) {
  return mime === "application/zip"
}

function mediaSrc(asset: CreativeAsset) {
  return `/api/creative-assets/${asset.id}/download`
}

function previewSrc(asset: CreativeAsset) {
  return `/api/creative-assets/${asset.id}/preview/`
}

function slotMatches(asset: CreativeAsset, slot: AdSlot) {
  return asset.width_px === slot.width && asset.height_px === slot.height
}

function AdSlotFrame({
  slot,
  asset,
  matched,
}: {
  slot: AdSlot
  asset: CreativeAsset
  matched: boolean
}) {
  return (
    <div
      className={cn(
        "mx-auto flex flex-col items-center justify-center overflow-hidden rounded-input border border-dashed border-border bg-surface-panel",
        matched ? "border-solid border-border bg-card shadow-e0" : null,
      )}
      style={{ width: slot.width, height: slot.height, maxWidth: "100%" }}
    >
      {matched ? (
        <CreativeInSlot asset={asset} width={slot.width} height={slot.height} />
      ) : (
        <div className="px-3 text-center text-xs text-muted-foreground">
          <p className="font-medium">{slot.label}</p>
          <p className="num mt-1">
            {slot.width}×{slot.height}
          </p>
        </div>
      )}
    </div>
  )
}

function CreativeInSlot({
  asset,
  width,
  height,
}: {
  asset: CreativeAsset
  width: number
  height: number
}) {
  if (isHtml5Zip(asset.mime_type)) {
    return (
      <iframe
        title={`${asset.asset_name} preview`}
        src={previewSrc(asset)}
        width={width}
        height={height}
        sandbox="allow-scripts"
        className="border-0"
      />
    )
  }

  if (isVideo(asset.mime_type)) {
    return (
      <video
        className="h-full w-full object-contain"
        src={mediaSrc(asset)}
        muted
        autoPlay
        loop
        playsInline
        width={width}
        height={height}
      />
    )
  }

  if (isImage(asset.mime_type)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- trusted campaign asset via authenticated download route
      <img
        className="h-full w-full object-contain"
        src={mediaSrc(asset)}
        alt={asset.asset_name}
        width={width}
        height={height}
      />
    )
  }

  return (
    <p className="px-3 text-center text-xs text-muted-foreground">
      Unsupported creative type for this slot.
    </p>
  )
}

function MatchNotice({ asset, slots }: { asset: CreativeAsset; slots: AdSlot[] }) {
  const hasMatch = slots.some((slot) => slotMatches(asset, slot))
  if (hasMatch) return null
  return (
    <div className="rounded-input border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
      No {asset.width_px}×{asset.height_px} slot in this template
    </div>
  )
}

function NewsArticleTemplate({ asset }: { asset: CreativeAsset }) {
  const template = getMockTemplate("news-article")
  const slots = template.slots ?? []
  const byId = Object.fromEntries(slots.map((slot) => [slot.id, slot])) as Record<string, AdSlot>

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4">
      <MatchNotice asset={asset} slots={slots} />
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <header className="border-b border-border px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The Daily Brief
          </p>
          <nav className="mt-2 flex flex-wrap gap-4 text-sm text-foreground">
            <span>Home</span>
            <span>Politics</span>
            <span>Business</span>
            <span>Culture</span>
            <span>Sport</span>
          </nav>
        </header>

        <div className="border-b border-border px-6 py-4">
          <AdSlotFrame
            slot={byId["leaderboard-top"]}
            asset={asset}
            matched={slotMatches(asset, byId["leaderboard-top"])}
          />
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Markets steady as brands rethink mid-funnel media mix
            </h1>
            <p className="text-sm text-muted-foreground">By Alex Rivera · 4 min read</p>
            <p className="text-sm leading-relaxed text-foreground">
              Advertisers are shifting spend toward measurable mid-funnel placements while keeping
              brand storytelling intact. Publishers say premium inventory remains resilient even as
              programmatic rates soften.
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              Agencies report stronger performance when creative formats are matched tightly to
              placement sizes — especially MREC and half-page units that sit alongside long-form
              journalism.
            </p>

            <div className="py-2">
              <AdSlotFrame
                slot={byId["mrec-incontent"]}
                asset={asset}
                matched={slotMatches(asset, byId["mrec-incontent"])}
              />
            </div>

            <p className="text-sm leading-relaxed text-foreground">
              Meanwhile, retail media and CTV continue to pull budget from legacy display, though
              news environments still deliver high attention for considered categories.
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              The takeaway for planners: treat slot dimensions as a first-class creative brief, not
              an afterthought once the plan is locked.
            </p>
          </article>

          <aside className="space-y-4">
            <AdSlotFrame
              slot={byId["mrec-rail"]}
              asset={asset}
              matched={slotMatches(asset, byId["mrec-rail"])}
            />
            <AdSlotFrame
              slot={byId["halfpage-rail"]}
              asset={asset}
              matched={slotMatches(asset, byId["halfpage-rail"])}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

function HomepageTemplate({ asset }: { asset: CreativeAsset }) {
  const template = getMockTemplate("homepage")
  const slots = template.slots ?? []
  const byId = Object.fromEntries(slots.map((slot) => [slot.id, slot])) as Record<string, AdSlot>

  const stories = [
    { title: "City opens waterfront precinct", kicker: "Local" },
    { title: "Tech earnings beat forecasts", kicker: "Markets" },
    { title: "National side names squad", kicker: "Sport" },
    { title: "Festival tickets sell out", kicker: "Culture" },
    { title: "Climate report flags risks", kicker: "World" },
    { title: "Startup raises Series B", kicker: "Business" },
  ]

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4">
      <MatchNotice asset={asset} slots={slots} />
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <header className="border-b border-border px-6 py-5 text-center">
          <p className="text-2xl font-semibold tracking-tight text-foreground">Metro Herald</p>
          <p className="mt-1 text-xs text-muted-foreground">Saturday edition · Live updates</p>
        </header>

        <div className="border-b border-border px-6 py-4">
          <AdSlotFrame
            slot={byId["billboard-top"]}
            asset={asset}
            matched={slotMatches(asset, byId["billboard-top"])}
          />
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {stories.map((story) => (
                <div
                  key={story.title}
                  className="rounded-input border border-border bg-surface-panel p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {story.kicker}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{story.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Brief coverage placeholder for mockup layout.
                  </p>
                </div>
              ))}
            </div>

            <AdSlotFrame
              slot={byId["leaderboard-mid"]}
              asset={asset}
              matched={slotMatches(asset, byId["leaderboard-mid"])}
            />
          </div>

          <aside>
            <AdSlotFrame
              slot={byId["mrec-sidebar"]}
              asset={asset}
              matched={slotMatches(asset, byId["mrec-sidebar"])}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

export function WebPageMockTemplates({ templateId, asset }: WebPageMockTemplatesProps) {
  if (templateId === "news-article") {
    return <NewsArticleTemplate asset={asset} />
  }
  return <HomepageTemplate asset={asset} />
}
