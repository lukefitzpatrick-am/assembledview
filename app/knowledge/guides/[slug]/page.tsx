"use client"

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { guides } from "@/src/data/learning/guides";
import { ArrowLeft } from "lucide-react";

type PageProps = { params: Promise<{ slug: string }> };

export default function GuideDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) return notFound();

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6 py-8 space-y-6">
        <Link
          href="/knowledge/guides"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          All guides
        </Link>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">{guide.group}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{guide.title}</h1>
          <p className="text-muted-foreground">{guide.summary}</p>
          <div className="flex items-center gap-2">
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
        </div>

        <div className="space-y-6">
          {guide.sections.map((section, index) => (
            <section key={index} className="space-y-2">
              <h2 className="text-base font-semibold">{section.heading}</h2>
              {section.paragraphs?.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="text-sm text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="text-sm text-muted-foreground">
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="rounded-card border border-border bg-card shadow-e1 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Further reading</h2>
          <div className="flex flex-col gap-1">
            {guide.furtherReading.map((link) => (
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

        {guide.relatedTerms && guide.relatedTerms.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Related terms</h2>
            <div className="flex flex-wrap gap-2">
              {guide.relatedTerms.map((term) => (
                <Link
                  key={term}
                  href={`/knowledge/definitions?q=${encodeURIComponent(term)}`}
                  className="rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Badge variant="outline" className="cursor-pointer bg-surface-muted text-text-secondary border-border">
                    {term}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
