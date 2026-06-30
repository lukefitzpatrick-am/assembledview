"use client"

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { platforms } from "@/src/data/learning/platforms";
import { ArrowLeft } from "lucide-react";

type PageProps = { params: Promise<{ slug: string }> };

export default function PlatformDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const platform = platforms.find((item) => item.slug === slug);
  if (!platform) return notFound();

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6 py-8 space-y-6">
        <Link
          href="/knowledge/platforms"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          All platforms
        </Link>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">{platform.cert}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{platform.name}</h1>
          <p className="text-muted-foreground">{platform.summary}</p>
        </div>

        <div className="rounded-card border border-border bg-surface-muted p-4">
          <p className="text-sm text-text-secondary">{platform.emphasis}</p>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">The six pillars</h2>
          <Accordion type="multiple" className="rounded-card border border-border bg-card shadow-e1 px-4">
            {platform.pillars.map((pillar, index) => (
              <AccordionItem key={pillar.name} value={`pillar-${index}`}>
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="num">{index + 1}.</span> {pillar.name}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{pillar.detail}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="rounded-card border border-border bg-card shadow-e1 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Official sources</h2>
          <p className="text-xs text-muted-foreground">Specs change often - defer to the official page for current specs.</p>
          <div className="flex flex-col gap-1 pt-1">
            {platform.officialLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {link.label} &nearr;
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
