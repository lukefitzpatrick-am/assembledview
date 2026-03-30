"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Building2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  TrendingUp,
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
 * Mirrors AppSidebar: full internal nav for admin; client slug dashboard + Learning for others.
 */
function isHrefVisibleForUser(
  href: string,
  isAdmin: boolean,
  userClient: string | null
): boolean {
  if (isAdmin) return true
  if (href === "/learning" || href.startsWith("/learning/")) return true
  if (userClient) {
    const base = `/dashboard/${userClient}`
    if (href === base || href.startsWith(`${base}/`)) return true
  }
  return false
}

function getPrimaryNavItems(isAdmin: boolean, userClient: string | null): NavItem[] {
  if (isAdmin) {
    return [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        searchTerms: "home",
      },
      {
        title: "Publishers",
        href: "/publishers",
        icon: Building2,
      },
      {
        title: "Pacing",
        href: "/pacing",
        icon: TrendingUp,
      },
      {
        title: "Media plans",
        href: "/mediaplans",
        icon: FileText,
        searchTerms: "campaigns mediaplans",
      },
      {
        title: "Learning",
        href: "/learning",
        icon: BookOpen,
      },
    ]
  }

  const items: NavItem[] = []
  if (userClient) {
    items.push({
      title: "Dashboard",
      href: `/dashboard/${userClient}`,
      icon: LayoutDashboard,
      searchTerms: "home client",
    })
  }
  items.push({ title: "Learning", href: "/learning", icon: BookOpen })
  return items
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
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
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
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Shortcut cheat sheet — coming soon.
          </div>
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
