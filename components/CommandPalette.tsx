"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Building2,
  ClipboardList,
  Compass,
  DollarSign,
  FileText,
  HelpCircle,
  Images,
  LayoutDashboard,
  ListTodo,
  PlusCircle,
  Search,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react"

import { useAuthContext } from "@/contexts/AuthContext"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"

const RECENTS_STORAGE_KEY = "avmediaplan.commandPalette.recents"
const MAX_RECENTS = 10

type RecentEntry = {
  href: string
  title: string
  at: number
}

type NavItem = {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Extra tokens for cmdk filtering */
  searchTerms?: string
}

function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (r): r is RecentEntry =>
          r !== null &&
          typeof r === "object" &&
          typeof (r as RecentEntry).href === "string" &&
          typeof (r as RecentEntry).title === "string" &&
          typeof (r as RecentEntry).at === "number"
      )
      .sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

function saveRecents(entries: RecentEntry[]) {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENTS)))
  } catch {
    // ignore quota / private mode
  }
}

function recordRecent(href: string, title: string) {
  const prev = loadRecents().filter((r) => r.href !== href)
  const next: RecentEntry[] = [{ href, title, at: Date.now() }, ...prev].slice(0, MAX_RECENTS)
  saveRecents(next)
}

/**
 * Mirrors AppSidebar: full internal nav for admin; client slug dashboard + Knowledge Hub for others.
 */
function isHrefVisibleForUser(
  href: string,
  isAdmin: boolean,
  userClient: string | null
): boolean {
  if (isAdmin) return true
  if (href === "/knowledge" || href.startsWith("/knowledge/")) return true
  if (userClient) {
    const base = `/dashboard/${userClient}`
    if (href === base || href.startsWith(`${base}/`)) return true
  }
  return false
}

/** Labels match AppSidebar exactly — terminology law: Campaigns + Planning. */
function getPrimaryNavItems(isAdmin: boolean, userClient: string | null): NavItem[] {
  if (isAdmin) {
    return [
      { title: "Home", href: "/dashboard", icon: LayoutDashboard, searchTerms: "dashboard overview" },
      {
        title: "Campaigns",
        href: "/mediaplans",
        icon: FileText,
        searchTerms: "media plans mediaplans mba",
      },
      { title: "Creative", href: "/creative", icon: Images },
      { title: "Scopes of Work", href: "/scopes-of-work", icon: ClipboardList, searchTerms: "sow scopes" },
      { title: "Tasks", href: "/tasks", icon: ListTodo },
      { title: "Pacing", href: "/pacing", icon: TrendingUp },
      {
        title: "Planning",
        href: "/tools/behavioural-planner",
        icon: Compass,
        searchTerms: "demand flow behavioural planner audience",
      },
      { title: "Publishers", href: "/publishers", icon: Building2 },
      { title: "Client hub", href: "/client", icon: Users },
      { title: "Finance", href: "/finance", icon: DollarSign },
      {
        title: "Knowledge Hub",
        href: "/knowledge",
        icon: BookOpen,
        searchTerms: "learning glossary definitions acronyms formulas",
      },
      {
        title: "Create Campaign",
        href: "/mediaplans/create",
        icon: PlusCircle,
        searchTerms: "new media plan",
      },
      {
        title: "Admin User Enrolment",
        href: "/admin/users/new",
        icon: Shield,
        searchTerms: "user management invite admin",
      },
    ]
  }

  const items: NavItem[] = []
  if (userClient) {
    items.push({
      title: "Home",
      href: `/dashboard/${userClient}`,
      icon: LayoutDashboard,
      searchTerms: "dashboard client",
    })
    items.push({
      title: "Creative",
      href: `/dashboard/${userClient}/creative`,
      icon: Images,
    })
  }
  items.push({
    title: "Knowledge Hub",
    href: "/knowledge",
    icon: BookOpen,
    searchTerms: "learning knowledge glossary",
  })
  return items
}

export function CommandPaletteTrigger({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        window.dispatchEvent(new CustomEvent("av:open-command-palette"))
      }}
      aria-label="Open command palette"
      title="Search pages (⌘K / Ctrl+K)"
    >
      <Search className="mr-1.5 h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
        ⌘K
      </kbd>
    </Button>
  )
}

export function CommandPalette() {
  const router = useRouter()
  const { isAdmin, userClient, isLoading } = useAuthContext()
  const [open, setOpen] = React.useState(false)
  const [cheatOpen, setCheatOpen] = React.useState(false)
  const [recents, setRecents] = React.useState<RecentEntry[]>([])

  const primaryItems = React.useMemo(
    () => (!isLoading ? getPrimaryNavItems(isAdmin, userClient) : []),
    [isAdmin, userClient, isLoading]
  )

  const refreshRecents = React.useCallback(() => {
    const all = loadRecents()
    setRecents(
      all.filter((r) => isHrefVisibleForUser(r.href, isAdmin, userClient)).slice(0, MAX_RECENTS)
    )
  }, [isAdmin, userClient])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener("av:open-command-palette", onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("av:open-command-palette", onOpen)
    }
  }, [])

  React.useEffect(() => {
    if (open) {
      refreshRecents()
      setCheatOpen(false)
    }
  }, [open, refreshRecents])

  const navigate = React.useCallback(
    (href: string, title: string) => {
      recordRecent(href, title)
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  const onOpenChange = React.useCallback((next: boolean) => {
    setOpen(next)
    if (!next) setCheatOpen(false)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {cheatOpen ? (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setCheatOpen(false)}
            >
              Back
            </Button>
            <span className="text-sm font-medium">Keyboard shortcuts</span>
          </div>
          <ul className="space-y-3 px-4 py-5 text-sm">
            <li className="flex items-center justify-between gap-4">
              <span>Open command palette</span>
              <CommandShortcut>⌘K / Ctrl+K</CommandShortcut>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Keyboard shortcuts (from palette)</span>
              <CommandShortcut>?</CommandShortcut>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Navigate results</span>
              <CommandShortcut>↑ ↓</CommandShortcut>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Open selected</span>
              <CommandShortcut>Enter</CommandShortcut>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Close</span>
              <CommandShortcut>Esc</CommandShortcut>
            </li>
          </ul>
        </>
      ) : (
        <>
          <CommandInput
            placeholder="Search pages…"
            onKeyDown={(e) => {
              if (e.key === "?" && e.currentTarget.value === "") {
                e.preventDefault()
                setCheatOpen(true)
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading…" : "No results found."}
            </CommandEmpty>

            {recents.length > 0 && (
              <CommandGroup heading="Recent">
                {recents.map((r) => (
                  <CommandItem
                    key={r.href}
                    value={`${r.title} ${r.href} recent`}
                    onSelect={() => navigate(r.href, r.title)}
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{r.href}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {primaryItems.length > 0 && (
              <>
                {recents.length > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading="Go to">
                  {primaryItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <CommandItem
                        key={item.href}
                        value={`${item.title} ${item.href} ${item.searchTerms ?? ""}`}
                        onSelect={() => navigate(item.href, item.title)}
                      >
                        <Icon className="text-muted-foreground" />
                        <span>{item.title}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Help">
              <CommandItem
                value="keyboard shortcuts help cheat sheet"
                onSelect={() => setCheatOpen(true)}
              >
                <HelpCircle className="text-muted-foreground" />
                <span>Keyboard shortcuts</span>
                <CommandShortcut>?</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            <span className="mr-3">Open palette ⌘K / Ctrl+K</span>
            <span>Cheat sheet ?</span>
          </div>
        </>
      )}
    </CommandDialog>
  )
}
