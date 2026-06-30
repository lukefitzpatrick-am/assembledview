"use client"

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guides } from "@/src/data/learning/guides";
import { Compass, Search } from "lucide-react";

const COLLECTIONS = [
  { id: "2026", label: "2026 shifts" },
  { id: "au", label: "Australian media" },
];

export default function GuidesPage() {
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guides.filter((guide) => {
      if (collection && !(guide.collections ?? []).includes(collection)) return false;
      if (q && !`${guide.title} ${guide.summary} ${guide.group}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, collection]);

  const groups = useMemo(() => {
    const order: string[] = [];
    filtered.forEach((guide) => {
      if (!order.includes(guide.group)) order.push(guide.group);
    });
    return order;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="px-4 py-3 md:px-6 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary tracking-wide">Knowledge Hub</p>
            <h1 className="text-xl font-semibold">Guides</h1>
            <p className="text-sm text-muted-foreground">
              Best-practice across planning, measurement and channels - each with sources to read more.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search guides"
                className="pl-9 rounded-input focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge
                onClick={() => setCollection(null)}
                variant={collection === null ? "default" : "outline"}
                className="cursor-pointer"
              >
                All
              </Badge>
              {COLLECTIONS.map((item) => (
                <Badge
                  key={item.id}
                  onClick={() => setCollection(item.id)}
                  variant={collection === item.id ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 space-y-8">
        {groups.map((group) => (
          <div key={group} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered
                .filter((guide) => guide.group === group)
                .map((guide) => (
                  <Link
                    key={guide.slug}
                    href={`/knowledge/guides/${guide.slug}`}
                    className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Card className="h-full cursor-pointer rounded-card shadow-e1 transition hover:shadow-e2">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Compass className="h-4 w-4 text-primary" />
                          {guide.level ? (
                            <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">
                              {guide.level}
                            </Badge>
                          ) : null}
                          {(guide.collections ?? []).map((collectionId) => (
                            <Badge key={collectionId} variant="secondary">
                              {collectionId === "au" ? "AU" : "2026"}
                            </Badge>
                          ))}
                        </div>
                        <CardTitle className="text-base pt-2">{guide.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{guide.summary}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
            </div>
          </div>
        ))}
        {!filtered.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-semibold">No guides match</p>
            <p className="text-sm">Try a different search or clear the filter.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
