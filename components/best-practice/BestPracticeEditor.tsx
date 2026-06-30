"use client"

import type { BestPractice, BestPracticeSection } from "@/lib/types/bestPractice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type BestPracticeEditorProps = {
  value: BestPractice
  onChange: (value: BestPractice) => void
}

function emitSections(onChange: (value: BestPractice) => void, sections: BestPracticeSection[]) {
  onChange({ version: 1, sections })
}

function linesToItems(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function BestPracticeEditor({ value, onChange }: BestPracticeEditorProps) {
  const sections = value?.sections ?? []

  const updateSection = (index: number, patch: Partial<BestPracticeSection>) => {
    emitSections(
      onChange,
      sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    )
  }

  const addSection = () => {
    emitSections(onChange, [...sections, { heading: "", items: [] }])
  }

  const removeSection = (index: number) => {
    emitSections(
      onChange,
      sections.filter((_, sectionIndex) => sectionIndex !== index),
    )
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No best-practice sections yet.</p>
      ) : null}

      {sections.map((section, index) => (
        <div key={index} className="space-y-3 rounded-md border border-border/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor={`best-practice-heading-${index}`}>Section heading</Label>
              <Input
                id={`best-practice-heading-${index}`}
                value={section.heading ?? ""}
                onChange={(event) => updateSection(index, { heading: event.target.value })}
                placeholder="e.g. Naming guidance"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-7"
              onClick={() => removeSection(index)}
            >
              Remove section
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`best-practice-items-${index}`}>Bullet points</Label>
            <Textarea
              id={`best-practice-items-${index}`}
              value={(section.items ?? []).join("\n")}
              onChange={(event) => updateSection(index, { items: linesToItems(event.target.value) })}
              placeholder={"One bullet per line"}
              rows={5}
            />
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addSection}>
        Add section
      </Button>
    </div>
  )
}
