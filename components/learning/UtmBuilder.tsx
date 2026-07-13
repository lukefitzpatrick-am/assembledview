"use client";

import { useMemo, useState } from "react";
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
import { Check, Copy, ExternalLink } from "lucide-react";

const FIELDS: Array<{
  key: keyof UtmParams;
  param: string;
  label: string;
  hint: string;
  required?: boolean;
}> = [
  {
    key: "source",
    param: "utm_source",
    label: "Source",
    hint: "Where the traffic comes from — google, meta, newsletter",
    required: true,
  },
  {
    key: "medium",
    param: "utm_medium",
    label: "Medium",
    hint: "Marketing channel — cpc, paid-social, email, display",
    required: true,
  },
  {
    key: "campaign",
    param: "utm_campaign",
    label: "Campaign",
    hint: "Campaign name — spring-sale, always-on-q3",
    required: true,
  },
  { key: "id", param: "utm_id", label: "Campaign ID", hint: "Optional — ties to a campaign ID in GA4" },
  { key: "term", param: "utm_term", label: "Term", hint: "Optional — paid-search keyword" },
  {
    key: "content",
    param: "utm_content",
    label: "Content",
    hint: "Optional — distinguishes creatives/links, e.g. hero-cta",
  },
];

type Props = {
  compact?: boolean;
};

export function UtmBuilder({ compact = false }: Props) {
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

  const fields = compact ? FIELDS.filter((f) => f.required) : FIELDS;

  const preview = (
    <div className={cn("space-y-3", !compact && "lg:sticky lg:top-6")}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tagged URL</h2>
        <span className="num text-xs text-muted-foreground">{result.length} chars</span>
      </div>
      <div className="rounded-card border border-border border-l-2 border-l-primary bg-surface-muted p-4">
        <p className="break-all text-sm text-text-secondary">
          {result || <span className="text-muted-foreground">Your tagged URL will appear here.</span>}
        </p>
      </div>
      <Button type="button" onClick={copy} disabled={!canCopy} className="w-full gap-2">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy URL"}
      </Button>
      {!compact && (
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
      )}
    </div>
  );

  const form = (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <Card className="rounded-card border border-border bg-card shadow-e1">
        <CardContent className="pt-5 space-y-2">
          <Label htmlFor={compact ? "utm-base-compact" : "utm-base"}>Destination URL</Label>
          <Input
            id={compact ? "utm-base-compact" : "utm-base"}
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="https://www.yoursite.com.au/landing-page"
            className="rounded-input bg-background focus-visible:ring-ring"
            inputMode="url"
          />
          {baseWarn && (
            <p className="text-xs text-text-secondary">
              Tip: include <code>https://</code> so the link works everywhere.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Helpers</span>
        <ToggleChip on={opts.lowercase} onClick={() => setOpts((o) => ({ ...o, lowercase: !o.lowercase }))}>
          Lowercase
        </ToggleChip>
        <ToggleChip on={opts.dashes} onClick={() => setOpts((o) => ({ ...o, dashes: !o.dashes }))}>
          Spaces → hyphens
        </ToggleChip>
        <Badge variant="outline" className="bg-surface-muted text-text-secondary border-border">
          Values auto-encoded
        </Badge>
      </div>

      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`utm-${f.key}${compact ? "-compact" : ""}`} className="flex items-center gap-2">
              {f.label}
              <code className="text-xs text-muted-foreground">{f.param}</code>
              {f.required && <span className="text-xs text-primary">required</span>}
            </Label>
            <Input
              id={`utm-${f.key}${compact ? "-compact" : ""}`}
              value={params[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              className="rounded-input bg-background focus-visible:ring-ring"
            />
            {!compact && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
      </div>

      {!compact && missing.length > 0 && (
        <p className="text-sm text-text-secondary">
          Heads up — {missing.join(", ")} {missing.length === 1 ? "is" : "are"} usually required for clean
          reporting.
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-4">
        {form}
        {preview}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      {form}
      {preview}
    </div>
  );
}

function ToggleChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
