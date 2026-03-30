import * as React from "react"

import { Button } from "@/components/ui/button"

import {
  Panel,
  PanelActions,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/layout/Panel"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"

/** Default panel with header slots and body content. */
export function PanelDefaultExample() {
  return (
    <Panel className="max-w-xl">
      <PanelHeader>
        <div className="min-w-0 flex-1 space-y-1.5">
          <PanelTitle>Account details</PanelTitle>
          <PanelDescription>Update profile information visible to your team.</PanelDescription>
        </div>
        <PanelActions>
          <Button type="button" size="sm" variant="outline">
            Cancel
          </Button>
          <Button type="button" size="sm">
            Save
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelContent>
        <p className="text-sm text-muted-foreground">
          Main content uses semantic card background and border tokens.
        </p>
      </PanelContent>
    </Panel>
  )
}

/** Built-in skeleton lines in the content region. */
export function PanelLoadingExample() {
  return (
    <Panel variant="loading" className="max-w-xl">
      <PanelHeader>
        <div className="min-w-0 flex-1 space-y-1.5">
          <PanelTitle>Loading state</PanelTitle>
          <PanelDescription>Panel sets aria-busy while loading.</PanelDescription>
        </div>
      </PanelHeader>
      <PanelContent />
    </Panel>
  )
}

/** Empty variant with default copy; override with Panel emptyMessage or custom PanelContent children. */
export function PanelEmptyExample() {
  return (
    <Panel variant="empty" emptyMessage="No campaigns match these filters." className="max-w-xl">
      <PanelHeader>
        <PanelTitle>Empty state</PanelTitle>
      </PanelHeader>
      <PanelContent />
    </Panel>
  )
}

/** Error variant with message from Panel props. */
export function PanelErrorExample() {
  return (
    <Panel variant="error" errorMessage="We could not load this section. Try again." className="max-w-xl">
      <PanelHeader>
        <PanelTitle>Error state</PanelTitle>
      </PanelHeader>
      <PanelContent />
    </Panel>
  )
}

/** Content-only panel (no header); use PanelContent standalone padding. */
export function PanelStandaloneContentExample() {
  return (
    <Panel className="max-w-md">
      <PanelContent standalone>
        <p className="text-sm">Use <code className="rounded bg-muted px-1 py-0.5 text-xs">standalone</code> on{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">PanelContent</code> when there is no header.</p>
      </PanelContent>
    </Panel>
  )
}

/** PanelRow: section title, helper text, 12-col grid (1 col mobile, 2 cols md+). */
export function PanelRowGridExample() {
  return (
    <Panel className="max-w-3xl">
      <PanelHeader>
        <PanelTitle>Layout row</PanelTitle>
        <PanelDescription>PanelRow nests inside Panel or any page surface.</PanelDescription>
      </PanelHeader>
      <PanelContent>
        <PanelRow
          title="Contact"
          helperText="We will use this for billing notifications only."
        >
          <PanelRowCell>
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">Column A</div>
          </PanelRowCell>
          <PanelRowCell>
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">Column B</div>
          </PanelRowCell>
          <PanelRowCell span="full">
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Full-width cell (span=&quot;full&quot;)
            </div>
          </PanelRowCell>
        </PanelRow>
      </PanelContent>
    </Panel>
  )
}

/** Map of examples for devtools or a future Storybook file. */
export const panelLayoutExamples = {
  PanelDefaultExample,
  PanelLoadingExample,
  PanelEmptyExample,
  PanelErrorExample,
  PanelStandaloneContentExample,
  PanelRowGridExample,
} as const
