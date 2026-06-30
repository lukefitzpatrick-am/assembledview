type LearningType = "definition" | "acronym" | "formula";

export type FormulaVariable = {
  key: string;
  label: string;
  unit?: string;
  required?: boolean;
};

type FormulaOutput = {
  label: string;
  unit?: string;
};

export type FormulaDSL = {
  calculatorId?: string;
  expression: string;
  variables: FormulaVariable[];
  output: FormulaOutput;
  format: "currency" | "percent" | "number";
  inferred?: boolean;
  unmapped?: boolean;
};

export type LearningTerm = {
  id: string;
  term: string;
  canonicalTerm?: string;
  aliases?: string[];
  category: string;
  category_raw?: string | null;
  group?: string;
  definition: string;
  formula_or_notes?: string;
  type: LearningType;
  formula?: FormulaDSL;
  plainEnglish?: string;
  whyItMatters?: string;
  example?: string;
  practitionerNotes?: string;
  level?: "foundational" | "intermediate" | "advanced";
  sources?: { label: string; url: string }[];
  relatedGuides?: string[];
  reviewedAt?: string;
  status?: "draft" | "reviewed" | "published";
};

export type SortMode = "relevance" | "alpha" | "recent";

export type Section = "definitions" | "acronyms" | "formulas";































