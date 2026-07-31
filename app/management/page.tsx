"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Stub route (KNOWN-ISSUES D-8). No interactive controls until a real
 * management dashboard lands — date-range picker was removed because it
 * only mutated unused local state.
 */
export default function ManagementPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Management Overview</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Management Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Management dashboard is not available yet. This page will stay
            read-only until the dashboard ships.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
