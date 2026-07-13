"use client";

import termsData from "@/src/data/learning/terms.json";
import { LearningTerm } from "@/src/lib/learning/types";
import { FormulaCalculator } from "@/components/learning/FormulaCalculator";

const cpmTerm = (termsData as LearningTerm[]).find((t) => t.term === "CPM");

type Props = {
  compact?: boolean;
};

export function CpmCalculator({ compact = false }: Props) {
  if (!cpmTerm?.formula) return null;

  return (
    <FormulaCalculator
      formula={cpmTerm.formula}
      fallbackText={cpmTerm.formula_or_notes}
      compact={compact}
    />
  );
}
