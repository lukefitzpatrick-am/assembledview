"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PlusCircle, Search } from "lucide-react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoadingState } from "@/components/ui/states"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { resolveListViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

type AdminListedUser = {
  user_id: string
  email: string | null
  name: string | null
  role: string | null
  clientSlug: string | null
  lastLogin: string | null
  blocked: boolean
}

type UsersListResponse = {
  users: AdminListedUser[]
  total: number
  page: number
}

const PER_PAGE = 25
const SYDNEY_TZ = "Australia/Sydney"

function formatLastLogin(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function roleBadgeVariant(role: string | null): "default" | "info" | "secondary" | "outline" {
  const normalized = (role ?? "").trim().toLowerCase()
  if (normalized === "admin") return "default"
  if (normalized === "client") return "info"
  return "outline"
}

function roleLabel(role: string | null): string {
  const normalized = (role ?? "").trim()
  if (!normalized) return "—"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function AdminUsersPageInner() {
  const pageLabel = getRouteByExactPath("/admin/users")?.label ?? "Users"
  const [searchInput, setSearchInput] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [users, setUsers] = useState<AdminListedUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim()
      setQuery((prev) => {
        if (prev === next) return prev
        setPage(0)
        return next
      })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL("/api/admin/users", window.location.origin)
      url.searchParams.set("page", String(page))
      url.searchParams.set("perPage", String(PER_PAGE))
      if (query) url.searchParams.set("query", query)

      const response = await fetch(url.toString())
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `Failed to load users (${response.status})`)
      }

      const body = (await response.json()) as UsersListResponse
      if (!Array.isArray(body.users)) {
        throw new Error("Invalid users response")
      }
      setUsers(body.users)
      setTotal(typeof body.total === "number" ? body.total : body.users.length)
    } catch (err) {
      // Keep previous rows out of an "empty" path — error must win.
      setUsers([])
      setTotal(0)
      setError(err instanceof Error ? err.message : "Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [page, query, reloadKey])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const clearSearch = useCallback(() => {
    setSearchInput("")
    setQuery("")
    setPage(0)
  }, [])

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: users,
        visible: users,
        filtersActive: Boolean(query),
        clear: clearSearch,
        retry,
      }),
    [clearSearch, error, loading, query, retry, users],
  )

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const canPrev = page > 0
  const canNext = page + 1 < totalPages

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 bg-background px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{pageLabel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Auth0 application users. Role shown is a denormalised copy and may drift from Auth0 RBAC.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/users/new">
            <PlusCircle className="mr-2 h-4 w-4" aria-hidden />
            Add user
          </Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search Auth0 (Lucene query)…"
          className="pl-9"
          aria-label="Search users"
        />
      </div>

      <ViewStateBoundary
        state={viewState}
        errorTitle="Couldn't load users"
        emptyTitle="No users yet"
        emptyMessage="Invite someone to create the first Auth0 user."
        emptyAction={
          <Button asChild>
            <Link href="/admin/users/new">
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden />
              Add user
            </Link>
          </Button>
        }
        filteredEmptyTitle="No users match this search"
        filteredEmptyMessage="Clear the search or try a different Auth0 Lucene query."
        loadingRows={6}
      >
        {(rows) => (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((user) => (
                    <TableRow key={user.user_id} className="interactive-row">
                      <TableCell className="font-medium text-foreground">
                        {user.name?.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(user.role)} size="sm">
                          {roleLabel(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {user.clientSlug ?? "—"}
                      </TableCell>
                      <TableCell className="num text-sm text-muted-foreground">
                        {formatLastLogin(user.lastLogin)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.blocked ? "danger" : "success"}
                          size="sm"
                          className={cn(user.blocked && "font-semibold")}
                        >
                          {user.blocked ? "Blocked" : "Active"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="num">{total}</span> user{total === 1 ? "" : "s"}
                {total > 0 ? (
                  <>
                    {" "}
                    · page <span className="num">{page + 1}</span> of{" "}
                    <span className="num">{totalPages}</span>
                  </>
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canPrev || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </ViewStateBoundary>
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="mx-auto mt-10 max-w-6xl shadow-e1" />}>
      <AdminGuard>
        <AdminUsersPageInner />
      </AdminGuard>
    </Suspense>
  )
}
