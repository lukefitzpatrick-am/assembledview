"use client"

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  buildUtmUrl,
  missingRequired,
  looksLikeUrl,
  type UtmParams,
  type UtmOptions,
} from "@/src/lib/learning/utm";
import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";

const FIELDS: Array<{ key: keyof UtmParams; param: string; label: string; hint: string; required?: boolean }> = [
  { key: "source", param: "utm_source", label: "Source", hint: "Where the traffic comes from — google, meta, newsletter", required: true },
  { key: "medium", param: "utm_medium", label: "Medium", hint: "Marketing channel — cpc, paid-social, email, display", required: true },
  { key: "campaign", param: "utm_campaign", label: "Campaign", hint: "Campaign name — spring-sale, always-on-q3", required: true },
  { key: "id", param: "utm_id", label: "Campaign ID", hint: "Optional — ties to a campaign ID in GA4" },
  { key: "term", param: "utm_term", label: "Term", hint: "Optional — paid-search keyword" },
  { key: "content", param: "utm_content", label: "Content", hint: "Optional — distinguishes creatives/links, e.g. hero-cta" },
];

export default function UtmBuilderPage() {
  const [base, setBase] = useState("");
  const [params, setParams] = useState<UtmParams>({});
  const [opts, setOpts] = useState<UtmOptions>({ lowercase: true, dashes: true });
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => buildUtmUrl(base, params, opts), [base, params, opts]);
  const missing = missingRequired(params);
  const baseWarn = base.trim() !== "" && !looksLikeUrl(base);
  const canCopy = result.trim() !== "" && result.trim() !== base.trim();

  const setField = (key: keyof UtmParams, v: string) => setParams((p) => ({ ...p, [key]: v }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can still select the preview text */
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6 py-8 space-y-6">
        <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Knowledge Hub
        </Link>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">Tools</p>
          <h1 className="text-2xl font-semibold tracking-tight">UTM Builder</h1>
          <p className="text-muted-foreground">
            Tag a destination URL with campaign parameters so GA4 attributes the visit correctly. Free-form — the
            helpers below just keep things tidy.
          </p>
        </div>

        {/* Destination */}
        <Card className="rounded-card border border-border bg-card shadow-e1">
          <CardContent className="pt-5 space-y-2">
            <Label htmlFor="utm-base">Destination URL</Label>
            <Input
              id="utm-base"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="https://www.yoursite.com.au/landing-page"
              className="rounded-input bg-background focus-visible:ring-ring"
              inputMode="url"
            />
            {baseWarn && (
              <p className="text-xs text-text-secondary">Tip: include <code>https://</code> so the link works everywhere.</p>
            )}
          </CardContent>
        </Card>

        {/* Helpers */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Helpers</span>
          <ToggleChip on={opts.lowercase} onClick={() => setOpts((o) => ({ ...o, lowercase: !o.lowercase }))}>
            Lowercase
          </ToggleChip>
          <ToggleChip on={opts.dashes} onClick={() => setOpts((o) => ({ ...o, dashes: !o.dashes }))}>
            Spaces → hyphens
          </ToggleChip>
          <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">Values auto-encoded</Badge>
        </div>

        {/* Params */}
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`utm-${f.key}`} className="flex items-center gap-2">
                {f.label}
                <code className="text-xs text-muted-foreground">{f.param}</code>
                {f.required && <span className="text-xs text-primary">required</span>}
              </Label>
              <Input
                id={`utm-${f.key}`}
                value={params[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="rounded-input bg-background focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
        </div>

        {missing.length > 0 && (
          <p className="text-sm text-text-secondary">
            Heads up — {missing.join(", ")} {missing.length === 1 ? "is" : "are"} usually required for clean reporting.
          </p>
        )}

        {/* Result */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tagged URL</h2>
            <span className="num text-xs text-muted-foreground">{result.length} chars</span>
          </div>
          <div className="rounded-card border border-border bg-surface-muted p-4">
            <p className="break-all text-sm text-text-secondary">
              {result || <span className="text-muted-foreground">Your tagged URL will appear here.</span>}
            </p>
          </div>
          <Button type="button" onClick={copy} disabled={!canCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
        </div>

        <div className="rounded-card border border-border bg-card shadow-e1 p-4 text-sm text-muted-foreground">
          Prefer Google&apos;s version? The{" "}
          <a
            href="https://ga-dev-tools.google/ga4/campaign-url-builder/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Campaign URL Builder <ExternalLink className="h-3 w-3" />
          </a>{" "}
          is the canonical reference.
        </div>
      </div>
    </div>
  );
}

function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "default" : "outline"}
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-pill", !on && "bg-surface-muted text-text-secondary border-border")}
    >
      {children}
    </Button>
  );
}
