"use client"

import { use, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LearningCard } from "@/components/learning/LearningCard";
import { FormulaCalculator } from "@/components/learning/FormulaCalculator";
import { buildCategoryColorMap, getCategoryColor, normalizeCategory } from "@/components/learning/categoryColors";
import termsData from "@/src/data/learning/terms.json";
import { getRelatedTerms } from "@/src/lib/learning/related";
import { buildFuseIndex, sortResults } from "@/src/lib/learning/search";
import { getRecentTerms, getStoredQueries, pushRecentTerm, pushStoredQuery } from "@/src/lib/learning/storage";
import { LearningTerm, Section, SortMode } from "@/src/lib/learning/types";
import { BadgeCheck, BookOpen, ChevronDown, Copy, Filter, Search, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ section?: string }>;
};

const terms = termsData as LearningTerm[];
const validSections: Section[] = ["definitions", "acronyms", "formulas"];

export default function LearningSectionPage({ params }: PageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolvedParams = use(params);
  const sectionParam = (resolvedParams.section?.toLowerCase() ?? "") as Section;
  const section: Section = validSections.includes(sectionParam) ? sectionParam : "definitions";

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [savedQueries, setSavedQueries] = useState<string[]>([]);
  const [activeTermId, setActiveTermId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    terms.forEach((t) => {
      if (t.category) unique.add(t.category);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, []);

  const categoryColorMap = useMemo(() => buildCategoryColorMap(categories), [categories]);

  const fuse = useMemo(() => buildFuseIndex(terms), []);

  useEffect(() => {
    setRecentlyViewed(getRecentTerms());
    setSavedQueries(getStoredQueries());
  }, []);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id && terms.find((t) => t.id === id)) {
      setActiveTermId(id);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      if (trimmed.length > 1) {
        setSavedQueries(pushStoredQuery(trimmed));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const recentOrder = useMemo(() => {
    return recentlyViewed.reduce<Record<string, number>>((acc, id, idx) => {
      acc[id] = idx;
      return acc;
    }, {});
  }, [recentlyViewed]);

  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return terms.map((item) => ({ item }));
    }
    return fuse.search(trimmed).map((match) => ({ item: match.item, score: match.score }));
  }, [fuse, query]);

  const filteredResults = useMemo(() => {
    const filtered = searchResults.filter(({ item }) => {
      if (section === "definitions" && item.type !== "definition") return false;
      if (section === "acronyms" && item.type !== "acronym") return false;
      if (section === "formulas" && item.type !== "formula") return false;
      if (selectedCategories.length) {
        const lowered = selectedCategories.map((c) => c.toLowerCase());
        if (!lowered.includes((item.category || "").toLowerCase())) return false;
      }
      return true;
    });
    return sortResults(filtered, sortMode, recentOrder);
  }, [searchResults, section, selectedCategories, sortMode, recentOrder]);

  const displayedTerms = filteredResults.map((r) => r.item);
  const activeTerm = activeTermId ? terms.find((t) => t.id === activeTermId) : null;
  const activeCategoryColor = getCategoryColor(activeTerm?.category, categoryColorMap);
  const activeCategoryLabel = normalizeCategory(activeTerm?.category);

  const setTab = (value: string) => {
    const next = validSections.includes(value as Section) ? value : "definitions";
    router.replace(`/learning/${next}${activeTermId ? `?id=${activeTermId}` : ""}`, { scroll: false });
  };

  const handleCardClick = (term: LearningTerm) => {
    setActiveTermId(term.id);
    setRecentlyViewed(pushRecentTerm(term.id));
    router.replace(`${pathname}?id=${term.id}`, { scroll: false });
  };

  const clearFilters = () => {
    setQuery("");
    setSelectedCategories([]);
    setSortMode("relevance");
  };

  const relatedTerms = activeTerm ? getRelatedTerms(activeTerm, terms, searchResults) : [];

  const searchHint = query.trim().length === 0 && savedQueries.length ? savedQueries.slice(0, 3) : [];

  const badgeCount = selectedCategories.length;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="px-4 py-3 md:px-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase text-brand tracking-wide">Learning</p>
              <h1 className="text-xl font-semibold">Definitions, Acronyms, Formulas</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BadgeCheck className="h-4 w-4 text-brand" />
              <span>Fuzzy search with Fuse.js</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search terms, definitions, formulas"
                className="pl-9 pr-24"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setQuery("")}
                >
                  Clear
                </Button>
              )}
              {searchHint.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {searchHint.map((hint) => (
                    <Button key={hint} variant="secondary" size="sm" onClick={() => setQuery(hint)}>
                      {hint}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Categories
                    {badgeCount > 0 && <Badge variant="secondary">{badgeCount}</Badge>}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                  <p className="text-xs text-muted-foreground mb-2">Filter by category</p>
                  <ScrollArea className="h-64 pr-2">
                    <div className="space-y-2">
                      {categories.map((category) => {
                        const checked = selectedCategories.includes(category);
                        return (
                          <label key={category} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(val) => {
                                if (val) {
                                  setSelectedCategories((prev) => [...prev, category]);
                                } else {
                                  setSelectedCategories((prev) => prev.filter((c) => c !== category));
                                }
                              }}
                            />
                            <span>{category}</span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSelectedCategories([])}>
                    Clear categories
                  </Button>
                </PopoverContent>
              </Popover>
              <ToggleGroup type="single" value={sortMode} onValueChange={(val) => setSortMode((val as SortMode) || "relevance")}>
                <ToggleGroupItem value="relevance" aria-label="Sort by relevance" className="data-[state=on]:bg-primary/80 data-[state=on]:text-primary-foreground">
                  <SparkleIcon className="h-4 w-4" />
                  Relevance
                </ToggleGroupItem>
                <ToggleGroupItem value="alpha" aria-label="Sort A to Z" className="data-[state=on]:bg-primary/80 data-[state=on]:text-primary-foreground">
                  <ArrowUpAZIcon className="h-4 w-4" />
                  A–Z
                </ToggleGroupItem>
                <ToggleGroupItem value="recent" aria-label="Recently viewed" className="data-[state=on]:bg-primary/80 data-[state=on]:text-primary-foreground">
                  <Timer className="h-4 w-4" />
                  Recent
                </ToggleGroupItem>
              </ToggleGroup>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </div>
          <Tabs value={section} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="definitions">Definitions</TabsTrigger>
              <TabsTrigger value="acronyms">Acronyms</TabsTrigger>
              <TabsTrigger value="formulas">Formulas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {displayedTerms.map((term) => (
            <LearningCard
              key={term.id}
              term={term}
              onClick={handleCardClick}
              categoryColors={categoryColorMap}
            />
          ))}
        </div>
        {!displayedTerms.length && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-semibold">No results</p>
            <p className="text-sm">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      <Sheet open={Boolean(activeTerm)} onOpenChange={(open) => {
        if (!open) {
          setActiveTermId(null);
          router.replace(`/learning/${section}`, { scroll: false });
        }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {activeTerm && (
            <div className="space-y-4 pb-10">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-brand" />
                  {activeTerm.term}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border border-transparent shadow-sm"
                    style={{
                      backgroundColor: activeCategoryColor.backgroundColor,
                      color: activeCategoryColor.textColor,
                      borderColor: activeCategoryColor.borderColor,
                    }}
                  >
                    {activeCategoryLabel}
                  </Badge>
                  {activeTerm.canonicalTerm && <Badge variant="outline">AKA {activeTerm.canonicalTerm}</Badge>}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{activeTerm.definition}</p>
                {activeTerm.formula_or_notes && (
                  <p className="text-sm text-foreground/80 bg-muted/60 rounded-md px-3 py-2 whitespace-pre-wrap">
                    {activeTerm.formula_or_notes}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const body = `${activeTerm.term}\n${activeTerm.definition}${activeTerm.formula_or_notes ? `\n${activeTerm.formula_or_notes}` : ""}`;
                    navigator?.clipboard?.writeText(body);
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>

              {activeTerm.type === "formula" && (
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold">Calculator</p>
                    <p className="text-xs text-muted-foreground">
                      Mapped formulas get live calculators. Unmapped formulas show the expression.
                    </p>
                  </div>
                  <FormulaCalculator
                    formula={
                      activeTerm.formula || {
                        expression: activeTerm.formula_or_notes || "Formula pending mapping",
                        variables: [],
                        output: { label: "Result" },
                        format: "number",
                        unmapped: true,
                      }
                    }
                    fallbackText={activeTerm.formula_or_notes}
                  />
                </div>
              )}

              {relatedTerms.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Related terms</h3>
                  <div className="grid gap-2">
                    {relatedTerms.map((related) => (
                      <button
                        key={related.id}
                        className="text-left rounded-md border px-3 py-2 hover:bg-muted transition"
                        onClick={() => handleCardClick(related)}
                      >
                        <p className="font-medium">{related.term}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{related.definition}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SparkleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3 1.65 4.95L18 9.6l-4.35 1.65L12 16.2l-1.65-4.95L6 9.6l4.35-1.65Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function ArrowUpAZIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3 8 4-6 4 6" />
      <path d="M7 2v20" />
      <path d="M20 20h-7l7-9h-7" />
    </svg>
  );
}

