"use client"

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { resourceGroups, resourceCount, resourcesReviewedAt } from "@/src/data/learning/resources";
import { ArrowUpRight, GraduationCap } from "lucide-react";

export default function ResourcesPage() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
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
      </div>

      {/* On-page nav */}
      <div className="px-4 md:px-6 pt-4">
        <div className="flex flex-wrap gap-2">
          {resourceGroups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="rounded-pill border border-border bg-surface-muted px-3 py-1 text-xs text-text-secondary transition hover:text-primary hover:border-primary/40"
            >
              {g.title}
            </a>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-6 space-y-10">
        {resourceGroups.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-24 space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{g.title}</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">{g.blurb}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card className="group h-full cursor-pointer rounded-card shadow-e1 transition hover:shadow-e2">
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-tight">{item.label}</p>
                        <ArrowUpRight className="h-4 w-4 flex-none text-muted-foreground transition group-hover:text-primary" />
                      </div>
                      <p className="pt-1 text-sm text-muted-foreground">{item.blurb}</p>
                      <div className="flex flex-wrap gap-1.5 pt-3">
                        {item.cert ? (
                          <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">
                            <GraduationCap className="mr-1 h-3 w-3" /> Free cert
                          </Badge>
                        ) : null}
                        {item.au ? (
                          <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">AU</Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </section>
        ))}

        <p className="text-xs text-muted-foreground">
          Spot a dead or moved link? Fix it in <code className="text-text-secondary">src/data/learning/resources.ts</code> — it's the single source.
        </p>
      </div>
    </div>
  );
}
