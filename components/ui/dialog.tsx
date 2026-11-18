"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DialogStackingLayer } from "@/lib/ui/stackingLayers"
import { OpenerScope, useReturnFocus } from "@/components/ui/return-focus"

/** Root that remembers the opener, so focus returns to it on close (B57). */
const Dialog = ({ open, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) => (
  <OpenerScope open={open}>
    <DialogPrimitive.Root open={open} {...props} />
  </OpenerScope>
)

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

/**
 * The X in `DialogContent` and `SheetContent`: a 24 by 24 CSS px target (WCAG
 * 2.2 AA, B57fix). Set in px, not rem: `html` is 80% (87.5% on wide screens), so
 * `h-6` would be 19.2 px. Centred where the old bare icon sat.
 */
export const closeTargetClass =
  "absolute right-2.5 top-2.5 inline-flex h-[24px] w-[24px] items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"

const layerZClass = (layer: DialogStackingLayer) =>
  layer === "nested" ? "z-nested" : "z-modal"

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    layer?: DialogStackingLayer
  }
>(({ className, layer = "modal", ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      layerZClass(layer),
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /**
     * Overlay stack tier. Default `modal`. Pass `nested` when this dialog opens
     * from inside another Dialog or Sheet (same-tier rule — MB-29).
     */
    layer?: DialogStackingLayer
    /** Optional overlay classes (non-z styling). Do not pass raw z-[N]. */
    overlayClassName?: string
  }
>(({ className, children, layer = "modal", overlayClassName, onCloseAutoFocus, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay layer={layer} className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-e2 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        layerZClass(layer),
        className
      )}
      {...props}
      onCloseAutoFocus={useReturnFocus(onCloseAutoFocus)}
    >
      {children}
      <DialogPrimitive.Close className={cn(closeTargetClass, "data-[state=open]:bg-accent data-[state=open]:text-muted-foreground")}>
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
