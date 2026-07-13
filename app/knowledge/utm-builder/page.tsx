"use client"

import Link from "next/link";
import { UtmBuilder } from "@/components/learning/UtmBuilder";
import { ArrowLeft } from "lucide-react";

export default function UtmBuilderPage() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-8 space-y-6">
        <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Knowledge Hub
        </Link>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-primary tracking-wide">Tools</p>
          <h1 className="text-2xl font-semibold tracking-tight">UTM Builder</h1>
          <p className="text-muted-foreground max-w-2xl">
            Tag a destination URL with campaign parameters so GA4 attributes the visit correctly. Free-form — the
            helpers just keep things tidy.
          </p>
        </div>

        <UtmBuilder />
      </div>
    </div>
  );
}
