import assert from "node:assert/strict";
import test from "node:test";
import CalculatorsPage from "../../app/knowledge/calculators/page";
import termsData from "@/src/data/learning/terms.json";
import { LearningTerm } from "@/src/lib/learning/types";

const terms = termsData as LearningTerm[];

const calculatorTerms = terms
  .filter(
    (term) =>
      term.type === "formula" &&
      term.formula &&
      !term.formula.unmapped &&
      (term.formula.variables?.length ?? 0) > 0
  )
  .sort((a, b) => a.term.localeCompare(b.term));

test("calculators destination module exposes a page component", () => {
  assert.equal(typeof CalculatorsPage, "function");
});

test("calculator gallery has mapped CPM and ROAS formulas", () => {
  const termsByName = new Set(calculatorTerms.map((term) => term.term.toLowerCase()));

  assert.ok(calculatorTerms.length >= 30);
  assert.ok(termsByName.has("cpm"));
  assert.ok([...termsByName].some((term) => term.includes("roas")));
});
