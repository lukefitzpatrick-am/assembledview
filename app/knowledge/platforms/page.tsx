"use client"

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platforms } from "@/src/data/learning/platforms";
import { accent, type AccentKey } from "@/src/lib/learning/accents";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";

const PLATFORM_TONE: Record<string, AccentKey> = {
  "google-ads": "blue",
  "meta": "purple",
  "tiktok": "coral",
  "dv360-programmatic": "amber",
};

export default function PlatformsPage() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="px-4 py-3 md:px-6">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">Knowledge Hub</p>
          <h1 className="text-xl font-semibold">Platforms</h1>
          <p className="text-sm text-muted-foreground">
            Every platform on the same six-pillar scaffold, with our POV plus curated links to the official source of
            truth.
          </p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <Link
              key={platform.slug}
              href={`/knowledge/platforms/${platform.slug}`}
              className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {(() => {
                const a = accent(PLATFORM_TONE[platform.slug] ?? "neutral");
                return (
                  <Card className={cn("h-full cursor-pointer rounded-card border-l-2 bg-card shadow-e1 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-e2", a.border)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className={cn("grid h-8 w-8 place-items-center rounded-card", a.chip)}>
                            <Layers className="h-4 w-4" />
                          </span>
                          {platform.name}
                        </CardTitle>
                        <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">
                          <span className="num">6</span> pillars
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">{platform.cert}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{platform.summary}</p>
                    </CardContent>
                  </Card>
                );
              })()}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
