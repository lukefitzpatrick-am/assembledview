"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LearningTerm } from "@/src/lib/learning/types";
import { CategoryColor, getCategoryColor, normalizeCategory } from "./categoryColors";

type Props = {
  term: LearningTerm;
  onClick?: (term: LearningTerm) => void;
  highlight?: boolean;
  categoryColors?: Record<string, CategoryColor>;
};

export function LearningCard({ term, onClick, highlight, categoryColors }: Props) {
  const categoryKey = normalizeCategory(term.category);
  const categoryColor = getCategoryColor(categoryKey, categoryColors);

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
            className="border border-transparent shadow-sm"
            style={{
              backgroundColor: categoryColor.backgroundColor,
              color: categoryColor.textColor,
              borderColor: categoryColor.borderColor,
            }}
          >
            {categoryKey || "General"}
          </Badge>
        </div>
        {term.canonicalTerm && (
          <p className="text-xs text-muted-foreground">Also known as {term.canonicalTerm}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <p className="text-sm text-muted-foreground line-clamp-3">{term.definition}</p>
        {term.formula_or_notes && (
          <p className="text-xs text-foreground/80 bg-muted/60 rounded-md px-3 py-2 line-clamp-3">
            {term.formula_or_notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}





