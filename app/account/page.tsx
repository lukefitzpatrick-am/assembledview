"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Download,
  Key,
  Mail,
  MoreHorizontal,
  Plug,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react"

import { useUser } from "@/components/AuthWrapper"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getUserDisplayName, getUserInitials, getUserRoles } from "@/lib/rbac"

const notificationRows = [
  {
    key: "campaignAlerts",
    title: "Campaign alerts",
    description: "Send pacing, budget, and delivery notifications.",
  },
  {
    key: "weeklyDigest",
    title: "Weekly digest",
    description: "Receive a summary of active media-plan changes.",
  },
  {
    key: "securityNotices",
    title: "Security notices",
    description: "Notify me about account and sign-in changes.",
  },
] as const

const integrationRows = [
  {
    name: "Auth0",
    description: "Authentication, roles, and profile management.",
    connected: true,
    initials: "A0",
  },
  {
    name: "Xano",
    description: "Client, user, and media-plan data sync.",
    connected: true,
    initials: "XA",
  },
  {
    name: "SendGrid",
    description: "Invite and account email delivery.",
    connected: false,
    initials: "SG",
  },
  {
    name: "Vercel",
    description: "Hosting, deployment, and runtime environment.",
    connected: true,
    initials: "VC",
  },
] as const

type NotificationKey = (typeof notificationRows)[number]["key"]
type NotificationSettings = Record<NotificationKey, boolean>

export default function AccountPage() {
  const { user, isLoading, error } = useUser()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<NotificationSettings>({
    campaignAlerts: true,
    weeklyDigest: true,
    securityNotices: true,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push("/auth/login?returnTo=/dashboard")
    }
  }, [mounted, isLoading, user, router])

  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <LoadingState rows={5} className="w-full max-w-3xl shadow-e1" />
      </div>
    )
  }

  if (error) {
    return (
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <ErrorState title="Error loading account" message={error.message} />
      </main>
    )
  }

  if (!user) {
    return null
  }

  const displayName = getUserDisplayName(user)
  const initials = getUserInitials(user)
  const userRoles = getUserRoles(user)
  const primaryRole = userRoles[0] ?? "No role"
  const isAdmin = userRoles.includes("admin")
  const createdAt = user.updated_at ? new Date(user.updated_at).toLocaleDateString() : "Unknown"

  const handlePasswordChange = () => {
    window.open(
      `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL || "http://localhost:3000"}/auth/login?screen_hint=signup&returnTo=/dashboard`,
      "_blank",
    )
  }

  const handleProfileEdit = () => {
    window.open("https://auth0.com/docs/manage-users/user-accounts/user-profile", "_blank")
  }

  const handleExportData = () => {
    alert("Data export feature would be implemented here")
  }

  const handleDeleteAccount = () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      alert("Account deletion would be implemented here - requires admin approval")
    }
  }

  const toggleNotification = (key: NotificationKey) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <main className="bg-background px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-frame border border-border bg-surface-panel p-6 shadow-e1 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Badge variant="outline" className="w-fit capitalize">
              {primaryRole}
            </Badge>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Account Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your profile, team access, connected systems, and notification preferences.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/auth/logout")}>
            Sign Out
          </Button>
        </div>

        <Tabs defaultValue="profile" className="rounded-frame border border-border bg-card p-6 shadow-e1">
          <TabsList aria-label="Settings sections" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card className="rounded-card border-border bg-card shadow-e0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <User className="h-5 w-5 text-muted-foreground" aria-hidden />
                  Personal Information
                </CardTitle>
                <CardDescription>Your Auth0 profile details and application permissions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-5 rounded-card border border-border bg-surface-panel p-4 sm:flex-row sm:items-center">
                  <Avatar className="h-20 w-20 border border-border">
                    <AvatarImage src={user.picture} alt={displayName} />
                    <AvatarFallback className="bg-pacing-on-track-bg text-xl text-status-on-track-fg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-semibold text-foreground">{displayName}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4" aria-hidden />
                        {user.email}
                      </span>
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Member since <span className="num">{createdAt}</span>
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" onClick={handleProfileEdit}>
                    Edit Profile
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-card border border-border bg-surface-panel p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {user.email_verified ? "Verified" : "Not verified"}
                    </p>
                  </div>
                  <div className="rounded-card border border-border bg-surface-panel p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">User ID</p>
                    <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{user.sub}</p>
                  </div>
                  <div className="rounded-card border border-border bg-surface-panel p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roles</p>
                    {userRoles.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {userRoles.map((role) => (
                          <Badge
                            key={role}
                            variant={role === "admin" ? "critical" : role === "manager" ? "on-track" : "secondary"}
                            className="capitalize"
                          >
                            {role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No roles assigned</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-card border-border bg-card shadow-e0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Shield className="h-5 w-5 text-muted-foreground" aria-hidden />
                    Security & Authentication
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface-panel p-4">
                    <div className="flex items-center gap-3">
                      <Key className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <div>
                        <h3 className="font-medium text-foreground">Password</h3>
                        <p className="text-sm text-muted-foreground">Update your Auth0 password.</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handlePasswordChange}>
                      Change
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-card border-border bg-card shadow-e0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Download className="h-5 w-5 text-muted-foreground" aria-hidden />
                    Data Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface-panel p-4">
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <div>
                        <h3 className="font-medium text-foreground">Export Data</h3>
                        <p className="text-sm text-muted-foreground">Download all your account data.</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleExportData}>
                      Export
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-card border-pacing-critical-bg bg-pacing-critical-bg shadow-e0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-status-critical-fg">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 rounded-card border border-pacing-critical-bg bg-card p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <Trash2 className="mt-0.5 h-5 w-5 text-status-critical-fg" aria-hidden />
                    <div>
                      <h3 className="font-medium text-foreground">Delete Account</h3>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all associated data.
                      </p>
                      {isAdmin ? (
                        <p className="mt-2 text-xs text-status-critical-fg">
                          Admin accounts cannot be self-deleted. Contact a system administrator.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button variant="destructive" onClick={handleDeleteAccount} disabled={isAdmin}>
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <Card className="rounded-card border-border bg-card shadow-e0">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
                    Team Members
                  </CardTitle>
                  <CardDescription>People with access through your Auth0 organization and roles.</CardDescription>
                </div>
                <Button type="button" onClick={() => router.push("/admin/users/new")} disabled={!isAdmin}>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                  Invite member
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-card border border-border">
                  <Table>
                    <TableHeader className="bg-surface-panel">
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-border">
                              <AvatarImage src={user.picture} alt={displayName} />
                              <AvatarFallback className="bg-pacing-ahead-bg text-status-ahead-fg">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">{displayName}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {userRoles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {userRoles.map((role) => (
                                <Badge
                                  key={role}
                                  variant={role === "admin" ? "critical" : role === "manager" ? "on-track" : "secondary"}
                                  className="capitalize"
                                >
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="outline">Unassigned</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.email_verified ? "ahead" : "critical"} dot>
                            {user.email_verified ? "Active" : "Verify email"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Member actions">
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-card border-border bg-popover shadow-e2">
                              <DropdownMenuLabel>Member actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={handleProfileEdit}>Open profile management</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => router.push("/admin/users/new")}
                                disabled={!isAdmin}
                              >
                                Invite teammate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                {!isAdmin ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Invite access is available to admin users only.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {integrationRows.map((integration) => (
                <Card key={integration.name} className="rounded-card border-border bg-card shadow-e0">
                  <CardContent className="flex h-full flex-col gap-5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-pill border border-border bg-surface-panel text-sm font-bold text-foreground">
                          {integration.initials}
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{integration.name}</h3>
                          <p className="text-sm text-muted-foreground">{integration.description}</p>
                        </div>
                      </div>
                      <Plug className="h-5 w-5 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="mt-auto flex items-center justify-between rounded-card border border-border bg-surface-panel px-3 py-2">
                      <span className="text-sm font-medium text-foreground">
                        {integration.connected ? "Connected" : "Reconnect"}
                      </span>
                      <span
                        className={integration.connected ? "h-2.5 w-2.5 rounded-pill bg-status-success" : "h-2.5 w-2.5 rounded-pill bg-pacing-critical"}
                        aria-hidden
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card className="rounded-card border-border bg-card shadow-e0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Bell className="h-5 w-5 text-muted-foreground" aria-hidden />
                  Notifications
                </CardTitle>
                <CardDescription>Switches are local to this page and update immediately.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border rounded-card border border-border bg-surface-panel">
                {notificationRows.length > 0 ? (
                  notificationRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <h3 className="font-medium text-foreground">{row.title}</h3>
                        <p className="text-sm text-muted-foreground">{row.description}</p>
                      </div>
                      <Switch
                        checked={notifications[row.key]}
                        onCheckedChange={() => toggleNotification(row.key)}
                        aria-label={`Toggle ${row.title}`}
                      />
                    </div>
                  ))
                ) : (
                  <EmptyState title="No notification settings" message="Notification preferences will appear here." />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
