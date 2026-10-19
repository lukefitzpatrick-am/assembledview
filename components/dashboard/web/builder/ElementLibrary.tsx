"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { elementNeedsData } from "@/lib/webReport/builder/layout"
import { DISPLAY_LABEL, NEW_ELEMENTS } from "@/lib/webReport/builder/editor"
import {
  WEB_ELEMENT_GROUPS,
  WEB_REPORT_ELEMENTS,
  type WebElementId,
} from "@/lib/webReport/elements"

const ELEMENTS = Object.values(WEB_REPORT_ELEMENTS) as Array<(typeof WEB_REPORT_ELEMENTS)[WebElementId]>

export function ElementLibrary({
  counts,
  onAdd,
  onRemove,
}: {
  counts: Partial<Record<WebElementId, number>>
  onAdd: (id: WebElementId) => void
  onRemove: (id: WebElementId) => void
}) {
  return (
    <section aria-label="Element library" className="rounded-card border border-border bg-card p-3 shadow-e1">
      <h2 className="px-1 text-sm font-semibold text-foreground">Elements</h2>
      <div className="mt-3 flex flex-col gap-4">
        {WEB_ELEMENT_GROUPS.map((group) => (
          <div key={group}>
            <p className="px-1 text-xs font-semibold text-muted-foreground">{group}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {ELEMENTS.filter((element) => element.group === group).map((element) => {
                const count = counts[element.id] ?? 0
                const needsData = elementNeedsData(element.id)
                const isNew = NEW_ELEMENTS.includes(element.id)
                return (
                  <li
                    key={element.id}
                    className={`flex items-center gap-2 rounded-input border px-2 py-1 ${
                      needsData ? "border-dashed border-border" : "border-border"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-sm text-foreground">
                        <span className="truncate">{element.title}</span>
                        {isNew ? <Badge variant="outline" className="shrink-0">New</Badge> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {needsData ? "Needs data" : element.displays.map((display) => DISPLAY_LABEL[display]).join(", ")}
                      </p>
                    </div>
                    {count > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 px-2"
                        aria-label={`Remove ${element.title}`}
                        onClick={() => onRemove(element.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 px-3"
                      aria-label={`Add ${element.title}`}
                      onClick={() => onAdd(element.id)}
                    >
                      Add
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
