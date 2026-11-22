"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"
import { CircleHelp } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { clientFeatureOn } from "@/lib/features/client"
import { HELP_TIPS, helpTopicFor, type HelpTipId } from "@/lib/help/topics"

/** Scrolls to a step's part of the page and moves focus there (WCAG 2.4.3). */
function showMe(anchor: string) {
  const el = document.getElementById(anchor)
  if (!el) return
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1")
  el.focus({ preventScroll: true })
}

/** Top bar Help button and the page's help panel. Renders nothing when off or when the page has no topic. */
export function HelpPanel() {
  const topic = helpTopicFor(usePathname() ?? "")
  const [open, setOpen] = useState(false)
  const pending = useRef<string | null>(null)
  if (!clientFeatureOn("in_app_help") || !topic) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill bg-[var(--fill-track)] px-3 py-1.5 text-[13px] text-am-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-haspopup="dialog"
      >
        <CircleHelp className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Help
      </button>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(e) => {
          if (!pending.current) return
          e.preventDefault()
          showMe(pending.current)
          pending.current = null
        }}
      >
        <SheetHeader>
          <SheetTitle>{topic.title}</SheetTitle>
          <SheetDescription>{topic.summary}</SheetDescription>
        </SheetHeader>
        {topic.steps?.length ? (
          <section className="mt-6" aria-labelledby="help-steps">
            <h3 id="help-steps" className="text-sm font-semibold">Steps</h3>
            <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              {topic.steps.map((s) => (
                <li key={s.text}>
                  {s.text}
                  {s.anchor ? (
                    <button
                      type="button"
                      className="ml-2 text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        pending.current = s.anchor ?? null
                        setOpen(false)
                      }}
                    >
                      Show me
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {topic.tips?.length ? (
          <section className="mt-6" aria-labelledby="help-tips">
            <h3 id="help-tips" className="text-sm font-semibold">Good to know</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {topic.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {topic.links?.length ? (
          <p className="mt-6 text-sm">
            {topic.links.map((l) => (
              <Link key={l.href} href={l.href} className="mr-4 underline underline-offset-2" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/**
 * A "?" toggletip beside a field or figure. Opens on click or Enter, so it
 * works on touch and with a keyboard, which a hover tooltip does not.
 */
export function HelpTip({ id, label }: { id: HelpTipId; label: string }) {
  if (!clientFeatureOn("in_app_help")) return null
  return (
    <Popover>
      <PopoverTrigger
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-current opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Help: ${label}`}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="text-sm leading-relaxed" role="note">
        {HELP_TIPS[id]}
      </PopoverContent>
    </Popover>
  )
}
