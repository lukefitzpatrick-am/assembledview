"use client"

import type { KeyboardEvent } from "react";
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
  const openTerm = () => onClick?.(term);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openTerm();
  };

  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={openTerm}
      onKeyDown={handleKeyDown}
      className={cn(
        "rounded-card border-border/80 shadow-e1 transition hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        onClick && "cursor-pointer",
        highlight && "ring-2 ring-primary"
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
          <Badge variant="outline" size="sm" className="border-border bg-muted text-muted-foreground uppercase tracking-wide">
            {term.level}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}





