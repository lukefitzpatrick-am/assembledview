"use client"

import { useState, type FormEvent, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BookOpen, Calculator, Compass, FolderOpen, Globe, Layers, Link2, Search } from "lucide-react";
import { accent, type AccentKey } from "@/src/lib/learning/accents";

export default function KnowledgeHubHome() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    router.push(`/knowledge/definitions${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ""}`);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-8 space-y-10">
        {/* Hero */}
        <div className="space-y-3 rounded-card border border-border bg-card p-6 shadow-e1">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">Assembled Media · Knowledge Hub</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Everything you need to plan, buy, measure and explain media
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Definitions, calculators and best-practice — written so a client and a brand-new planner both get what
            they need, with every entry sourced.
          </p>
          <form onSubmit={submitSearch} className="relative max-w-xl pt-1">
            <Search className="absolute left-3 top-[18px] h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the glossary — CPM, reach, attribution…"
              className="pl-9 pr-20 bg-background focus-visible:ring-ring"
            />
            <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 translate-y-[2px]">
              Search
            </Button>
          </form>
        </div>

        {/* Start here */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Start here</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <StartCard href="/knowledge/definitions" n="1" title="Browse all definitions" desc="Plain-English terms with why-it-matters, examples and sources." />
            <StartCard href="/knowledge/acronyms" n="2" title="Acronyms" desc="Decode the alphabet soup — CPM, GRP, ROAS, VOZ and more." />
            <StartCard href="/knowledge/formulas" n="3" title="Formulas & calculators" desc="Solve for any variable across the core media-math formulas." />
            <StartCard href="/knowledge/definitions?q=attribution" n="4" title="Understand your report" desc="What each metric means, what's good, and what to ignore." />
          </div>
        </div>

        {/* Explore */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Explore the hub</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExploreCard href="/knowledge/definitions" icon={BookOpen} tone="green" title="Glossary" desc={<><span className="num">609</span> terms — definitions, acronyms & formulas.</>} live />
            <ExploreCard href="/knowledge/calculators" icon={Calculator} tone="blue" title="Calculators" desc="Live media-math calculators on every formula." live />
            <ExploreCard href="/knowledge/guides" icon={Compass} tone="amber" title="Guides" desc="Best-practice across planning, measurement & channels." live />
            <ExploreCard href="/knowledge/platforms" icon={Layers} tone="purple" title="Platforms" desc="Google, Meta, TikTok & programmatic skills." live />
            <ExploreCard href="/knowledge/resources" icon={Globe} tone="coral" title="Resource Hub" desc="Platform certs, AU currencies, standards & news." live />
            <ExploreCard href="/knowledge/utm-builder" icon={Link2} tone="magenta" title="UTM Builder" desc="Tag campaign URLs for clean GA4 attribution." live />
            <ExploreCard icon={FolderOpen} tone="neutral" title="Internal docs" desc="Assembled Media playbooks, processes & templates." />
          </div>
        </div>
      </div>
    </div>
  );
}

function StartCard({ href, n, title, desc }: { href: string; n: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <Card className="h-full cursor-pointer rounded-card shadow-e1 transition hover:shadow-e2">
        <CardContent className="flex items-start gap-3 pt-5">
          <div className="num flex-none w-7 h-7 rounded-pill bg-primary text-primary-foreground grid place-items-center text-sm font-bold">
            {n}
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ExploreCard({
  href,
  icon: Icon,
  title,
  desc,
  tone,
  live,
}: {
  href?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: ReactNode;
  tone: AccentKey;
  live?: boolean;
}) {
  const a = accent(tone);
  const inner = (
    <Card
      className={cn(
        "relative h-full overflow-hidden rounded-card shadow-e1 transition-all duration-150",
        href ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-e2" : "opacity-70"
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-[3px]", a.bar)} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className={cn("grid h-9 w-9 place-items-center rounded-card", a.chip)}>
            <Icon className="h-5 w-5" />
          </div>
          {!live && <Badge variant="secondary">Soon</Badge>}
        </div>
        <CardTitle className="text-base pt-2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {inner}
    </Link>
  ) : (
    inner
  );
}