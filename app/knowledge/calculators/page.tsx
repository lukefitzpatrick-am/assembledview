"use client"

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaCalculator } from "@/components/learning/FormulaCalculator";
import { getGroupColor } from "@/components/learning/categoryColors";
import termsData from "@/src/data/learning/terms.json";
import { LearningTerm } from "@/src/lib/learning/types";
import { Calculator, Search } from "lucide-react";

const terms = termsData as LearningTerm[];

const calculators = terms
  .filter(
    (t) =>
      t.type === "formula" &&
      t.formula &&
      !t.formula.unmapped &&
      (t.formula.variables?.length ?? 0) > 0
  )
  .sort((a, b) => a.term.localeCompare(b.term));

export default function CalculatorsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return calculators;
    return calculators.filter((t) =>
      `${t.term} ${t.group ?? ""} ${t.plainEnglish ?? t.definition ?? ""}`.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="px-4 py-3 md:px-6 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase text-brand tracking-wide">Knowledge Hub</p>
            <h1 className="text-xl font-semibold">Calculators</h1>
            <p className="text-sm text-muted-foreground">
              Solve for any variable — enter what you know, get the rest.
            </p>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search calculators — CPM, ROAS, reach…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((t) => {
            const color = getGroupColor(t.group);
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-brand" />
                      {t.term}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="border border-transparent shadow-sm"
                      style={{
                        backgroundColor: color.backgroundColor,
                        color: color.textColor,
                        borderColor: color.borderColor,
                      }}
                    >
                      {t.group ?? "Other / Uncategorised"}
                    </Badge>
                  </div>
                  {(t.plainEnglish ?? t.definition) && (
                    <p className="text-xs text-muted-foreground">{t.plainEnglish ?? t.definition}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <FormulaCalculator formula={t.formula!} fallbackText={t.formula_or_notes} />
                </CardContent>
              </Card>
            );
          })}
        </div>
        {!filtered.length && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-semibold">No calculators match</p>
            <p className="text-sm">Try a different search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
