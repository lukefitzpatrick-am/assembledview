"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LearningTerm } from "@/src/lib/learning/types";

type Props = {
  term: LearningTerm;
  onClick?: (term: LearningTerm) => void;
  highlight?: boolean;
};

export function LearningCard({ term, onClick, highlight }: Props) {
  const groupLabel = term.group ?? "Other / Uncategorised";

  return (
    <Card
      onClick={() => onClick?.(term)}
      className={cn(
        "cursor-pointer transition hover:shadow-lg border-border/80",
        highlight && "ring-2 ring-brand"
      )}
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg font-semibold text-foreground">{term.term}</CardTitle>
          <Badge
            variant="outline"
            className="border-border bg-surface-muted text-text-secondary"
          >
            {groupLabel}
          </Badge>
        </div>
        {term.canonicalTerm && (
          <p className="text-xs text-muted-foreground">Also known as {term.canonicalTerm}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {term.plainEnglish ?? term.definition}
        </p>
        {term.level && (
          <span className="inline-block text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
            {term.level}
          </span>
        )}
      </CardContent>
    </Card>
  );
}





