"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowUpRight, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { CAMPAIGN_BUDGET_REMAINING_BASIS_CAPTION } from "@/lib/mediaplan/campaignBudgetRemaining"
import { cn } from "@/lib/utils"

type PlanWizardStep = {
  id: string
  label: string
  sub: string
}

type PlanWizardRailSubItem = {
  id: string
  label: string
  scrollTargetId: string
}

type PlanWizardRailSubItems = {
  parentStepId: string
  items: PlanWizardRailSubItem[]
}

type PlanWizardSummary = {
  title: string
  client: string
  budget: string
  channels: number | string
  status: string
  budgetRemaining: string
  /** When true, budget remaining is shown as a warning (overspend). */
  budgetRemainingOverspend?: boolean
}

export type PlanWizardToolLink = {
  id: string
  label: string
  href: string
  description?: string
}

export type PlanWizardShellProps = {
  /** Breadcrumb + hero. Both create and edit pass `PlanWizardHeader`. */
  header: ReactNode
  steps: PlanWizardStep[]
  activeStep?: string
  railSubItems?: PlanWizardRailSubItems
  summary: PlanWizardSummary
  /** Edit-only campaign pages (Creative, Trafficking). Empty/absent → no card. */
  toolLinks?: PlanWizardToolLink[]
  /** Guarded navigation for `toolLinks`. Edit wires this to `requestNavigation`. */
  onNavigate?: (href: string) => void
  onExit: () => void
  /** Destination label for Exit (e.g. "Exit to Campaigns"). */
  exitLabel?: string
  /** Still accepted from create/edit; Saving… renders in `PlanWizardSaveMessages`. */
  isSaving?: boolean
  /** Extra hold (e.g. channel hydration) — disables Save in the floating bar. */
  saveDisabled?: boolean
  /** Why Save is held — shown as draft-summary state + floating-bar label. */
  saveDisabledReason?: string | null
  /** Sidebar card below Draft Summary. Omit or pass null when idle (no empty card). */
  statusPanel?: ReactNode
  bottomBar: ReactNode
  children: ReactNode
}

export function PlanWizardShell({
  header,
  steps,
  activeStep: activeStepProp,
  railSubItems,
  summary,
  toolLinks,
  onNavigate,
  onExit,
  exitLabel = "Exit to Campaigns",
  saveDisabled = false,
  saveDisabledReason = null,
  statusPanel = null,
  bottomBar,
  children,
}: PlanWizardShellProps) {
  const { open, setOpen: setSidebarOpen, isMobile: isSidebarMobile } = useSidebar()
  const capturedOpenRef = useRef(open)
  const setSidebarOpenRef = useRef(setSidebarOpen)
  setSidebarOpenRef.current = setSidebarOpen

  const [internalActiveStep, setInternalActiveStep] = useState(steps[0]?.id ?? "")
  const [activeRailItemId, setActiveRailItemId] = useState<string | null>(null)

  const activeStep = activeStepProp ?? internalActiveStep
  const activeStepIndex = steps.findIndex((step) => step.id === activeStep)

  const stickyBarRef = useRef<HTMLDivElement | null>(null)
  const [stickyBarHeight, setStickyBarHeight] = useState(0)

  useEffect(() => {
    const element = stickyBarRef.current
    if (!element) return

    const updateStickyBarHeight = () => {
      setStickyBarHeight(element.getBoundingClientRect().height || 0)
    }

    updateStickyBarHeight()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateStickyBarHeight)
      return () => window.removeEventListener("resize", updateStickyBarHeight)
    }

    const observer = new ResizeObserver(updateStickyBarHeight)
    observer.observe(element)
    window.addEventListener("resize", updateStickyBarHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateStickyBarHeight)
    }
  }, [])

  useEffect(() => {
    if (isSidebarMobile) return

    // Capture the pre-wizard preference. Cleanup restores that captured value,
    // not whatever the user toggled while the wizard was mounted.
    capturedOpenRef.current = open
    setSidebarOpenRef.current(false, { persist: false })

    return () => {
      setSidebarOpenRef.current(capturedOpenRef.current)
    }
    // `open` is snapshotted on this run only — do not re-collapse when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSidebarMobile])

  const scrollToTarget = useCallback((targetId: string) => {
    if (typeof window === "undefined") return

    window.setTimeout(() => {
      const target = document.getElementById(targetId)
      const scroller = document.getElementById("main")
      if (!target || !scroller) return

      // Scroll only the app shell <main> — never the window — so the 48px top-bar stays put.
      const offset = 18
      const nextTop =
        scroller.scrollTop + (target.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - offset
      scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
    }, 0)
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return

    const scrollRoot = document.getElementById("main")
    if (!scrollRoot) return

    const stepElements = steps
      .map((step) => document.getElementById(step.id))
      .filter((node): node is HTMLElement => Boolean(node))

    const railElements =
      railSubItems?.items
        .map((item) => document.getElementById(item.scrollTargetId))
        .filter((node): node is HTMLElement => Boolean(node)) ?? []

    const observedElements = [...stepElements, ...railElements]
    if (observedElements.length === 0) return

    const railTargetToItemId = new Map(
      railSubItems?.items.map((item) => [item.scrollTargetId, item.id]) ?? []
    )

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        const topTarget = visible[0]?.target
        if (!topTarget?.id) return

        const railItemId = railTargetToItemId.get(topTarget.id)
        if (railItemId && railSubItems) {
          if (!activeStepProp) {
            setInternalActiveStep(railSubItems.parentStepId)
          }
          setActiveRailItemId(railItemId)
          return
        }

        setActiveRailItemId(null)
        if (!activeStepProp) {
          setInternalActiveStep(topTarget.id)
        }
      },
      {
        root: scrollRoot,
        rootMargin: "-18px 0px -62% 0px",
        threshold: [0.2, 0.45, 0.7],
      }
    )

    observedElements.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [steps, railSubItems, activeStepProp])

  const holdReason =
    saveDisabled && saveDisabledReason
      ? saveDisabledReason
      : saveDisabled
        ? "Waiting for channels to load — you can't save yet"
        : null

  return (
    <div className="w-full min-h-0 overflow-visible pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-[1920px] space-y-6 overflow-visible px-4 pb-24 pt-0 sm:px-5 md:px-6 xl:px-8 2xl:px-10">
        {header}

        <div className="grid w-full grid-cols-1 items-start gap-5 overflow-visible xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-6">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:z-10 xl:self-start">
            <nav
              className="rounded-frame border border-border bg-card p-2.5 shadow-e1"
              aria-label="Campaign wizard progress"
            >
              <ol className="space-y-1">
                {steps.map((step, index) => {
                  const isCurrent = step.id === activeStep
                  const isPassed = index < activeStepIndex

                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => scrollToTarget(step.id)}
                        className={cn(
                          "group flex w-full items-center gap-2.5 rounded-card px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isCurrent
                            ? "bg-table-row-hover text-foreground shadow-e0"
                            : "text-muted-foreground hover:bg-table-row-hover hover:text-foreground"
                        )}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border text-[10px] font-semibold num",
                            isPassed
                              ? "border-primary bg-primary text-primary-foreground"
                              : isCurrent
                                ? "border-primary text-primary"
                                : "border-border bg-[var(--fill-track)] text-muted-foreground"
                          )}
                          aria-hidden="true"
                        >
                          {isPassed ? <Check className="h-3.5 w-3.5" /> : step.sub}
                        </span>
                        <span className="font-medium">{step.label}</span>
                      </button>
                      {railSubItems && step.id === railSubItems.parentStepId && railSubItems.items.length > 0 ? (
                        <ul className="ml-3 mt-1 space-y-0.5 border-l border-border/60 pl-2.5">
                          {railSubItems.items.map((item) => {
                            const isItemActive = activeRailItemId === item.id
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => scrollToTarget(item.scrollTargetId)}
                                  className={cn(
                                    "flex w-full rounded-input px-2 py-1.5 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    isItemActive
                                      ? "bg-table-row-hover font-medium text-foreground"
                                      : "text-muted-foreground hover:bg-table-row-hover hover:text-foreground"
                                  )}
                                  aria-current={isItemActive ? "true" : undefined}
                                >
                                  {item.label}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            </nav>

            {toolLinks && toolLinks.length > 0 ? (
              <nav
                className="rounded-frame border border-border bg-card p-2.5 shadow-e1"
                aria-label="Campaign tools"
              >
                <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Campaign tools
                </p>
                <ul className="mt-1 space-y-1">
                  {toolLinks.map((link) => (
                    <li key={link.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate?.(link.href)}
                        className="flex w-full items-center justify-between gap-2.5 rounded-card px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-table-row-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${link.label} (opens page)`}
                      >
                        <span className="font-medium">{link.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            <div className="rounded-frame border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-bg))] p-3 text-[hsl(var(--sidebar-foreground))] shadow-e1">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.65)]">
                  Draft Summary
                </p>
                <h2 className="text-sm font-semibold leading-tight break-words">{summary.title}</h2>
                <p className="text-xs break-words text-[hsl(var(--sidebar-foreground)/0.72)]">{summary.client}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.55)]">
                    Budget
                  </p>
                  <p className="num font-semibold">{summary.budget}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.55)]">
                    Channels
                  </p>
                  <p className="num font-semibold">{summary.channels}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.55)]">
                    Budget remaining
                  </p>
                  <p
                    className={cn(
                      "num font-semibold",
                      summary.budgetRemainingOverspend && "text-status-behind-fg"
                    )}
                  >
                    {summary.budgetRemaining}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-[hsl(var(--sidebar-foreground)/0.55)]">
                    {CAMPAIGN_BUDGET_REMAINING_BASIS_CAPTION}
                  </p>
                  {summary.budgetRemainingOverspend ? (
                    <p className="mt-0.5 text-[10px] leading-snug text-status-behind-fg">
                      Over campaign budget
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.55)]">
                    Status
                  </p>
                  <p className="font-semibold">{summary.status}</p>
                </div>
              </div>
              {holdReason ? (
                <p
                  className="mt-3 text-[10px] leading-snug text-[hsl(var(--sidebar-foreground)/0.72)]"
                  role="status"
                >
                  {holdReason}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-pill border-primary bg-primary/10 text-primary hover:bg-primary/25 hover:text-primary"
                  onClick={onExit}
                >
                  {exitLabel}
                </Button>
              </div>
            </div>
            {statusPanel}
          </aside>

          <div className="min-w-0 space-y-6 overflow-visible">{children}</div>
        </div>
      </div>

      <div aria-hidden="true" style={{ height: stickyBarHeight ? stickyBarHeight + 24 : 88 }} />

      <div
        ref={stickyBarRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
      >
        <div className="mx-auto flex w-full max-w-[1920px] justify-center px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10">
          <div className="pointer-events-auto flex min-w-0 max-w-full flex-row items-center rounded-frame border border-border/60 bg-card/85 px-3 py-2 shadow-e2 backdrop-blur-md sm:px-4">
            {bottomBar}
          </div>
        </div>
      </div>
    </div>
  )
}
