"use client"

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { resourceGroups, resourceCount, resourcesReviewedAt } from "@/src/data/learning/resources";
import { accent } from "@/src/lib/learning/accents";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight, GraduationCap, LifeBuoy, BarChart3, Building2,
  ShieldCheck, TrendingUp, Newspaper, Wrench, type LucideIcon,
} from "lucide-react";

const LIFT = "cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-e2";

const GROUP_ICON: Record<string, LucideIcon> = {
  "platform-training": GraduationCap,
  "platform-help": LifeBuoy,
  "au-measurement": BarChart3,
  "au-bodies": Building2,
  "global-standards": ShieldCheck,
  "effectiveness": TrendingUp,
  "news": Newspaper,
  "tools": Wrench,
};

export default function ResourcesPage() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scroll-smooth">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="px-4 py-3 md:px-6">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">Knowledge Hub</p>
          <h1 className="text-xl font-semibold">Resource Hub</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Curated links out to the platforms, measurement bodies and publications an outsourced media team should
            live in. <span className="num">{resourceCount}</span> sources · verified {resourcesReviewedAt}.
          </p>
        </div>
        {/* Mobile jump nav */}
        <div className="lg:hidden flex gap-2 overflow-x-auto px-4 md:px-6 pb-3">
          {resourceGroups.map((g) => (
            <a key={g.id} href={`#${g.id}`}
               className="whitespace-nowrap rounded-pill border border-border bg-surface-muted px-3 py-1 text-xs text-text-secondary">
              {g.title}
            </a>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-6">
        <div className="grid gap-8 lg:grid-cols-[236px_1fr]">
          {/* Sticky category rail */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-card border border-border bg-card shadow-e1 p-2">
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categories</p>
              {resourceGroups.map((g) => {
                const a = accent(g.accent);
                return (
                  <a key={g.id} href={`#${g.id}`}
                     className="flex items-center gap-2.5 rounded-input px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-[var(--row-hover)] hover:text-foreground">
                    <span className={cn("h-2.5 w-2.5 flex-none rounded-[3px]", a.dot)} />
                    <span className="truncate">{g.title}</span>
                    <span className="num ml-auto text-xs text-muted-foreground">{g.items.length}</span>
                  </a>
                );
              })}
              <div className="mt-2 border-t border-border px-3 pt-3 text-xs text-text-secondary">
                <span className="num font-semibold text-primary">{resourceCount}</span> sources · verified {resourcesReviewedAt}
              </div>
            </div>
          </aside>

          {/* Group sections */}
          <div>
            {resourceGroups.map((g) => {
              const a = accent(g.accent);
              const Icon = GROUP_ICON[g.id] ?? Wrench;
              return (
                <section key={g.id} id={g.id} className="scroll-mt-28 mb-10">
                  <div className="flex items-center gap-3">
                    <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-card", a.chip)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 className="text-lg font-semibold tracking-tight">{g.title}</h2>
                  </div>
                  <p className="mt-1 mb-4 ml-12 max-w-2xl text-sm text-muted-foreground">{g.blurb}</p>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((item) => (
                      <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"
                         className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Card className={cn(LIFT, "group h-full rounded-card border-l-2 bg-card shadow-e1", a.border)}>
                          <CardContent className="pt-5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold leading-tight">{item.label}</p>
                              <ArrowUpRight className="h-4 w-4 flex-none text-muted-foreground transition-colors group-hover:text-foreground" />
                            </div>
                            <p className="pt-1 text-sm text-muted-foreground">{item.blurb}</p>
                            <div className="flex flex-wrap gap-1.5 pt-3">
                              {item.cert && (
                                <Badge variant="outline" className={cn("border-transparent", a.chip)}>
                                  <GraduationCap className="mr-1 h-3 w-3" /> Free cert
                                </Badge>
                              )}
                              {item.au && (
                                <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">AU</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </a>
                    ))}
                  </div>
                </section>
              );
            })}

            <p className="text-xs text-muted-foreground">
              Spot a dead or moved link? Fix it in <code className="text-text-secondary">src/data/learning/resources.ts</code> — it&apos;s the single source.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
