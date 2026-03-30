import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert `#rgb` / `#rrggbb` to `rgba(r,g,b,a)` for gradients and overlays. */
export function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.trim().replace(/^#/, "")
  const expanded =
    trimmed.length === 3 ? trimmed.split("").map((c) => c + c).join("") : trimmed
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(79, 143, 203, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const theme = {
  colors: {
    // Primary Colors
    limeGreen: "#b5d337",
    teal: "#15c7c9",
    blue: "#4f8fcb",
    purple: "#9801b5",
    deepPurple: "#472477",

    // Secondary & Accent Colors
    pink: "#fd7adb",
    yellow: "#ffcf2a",
    orange: "#ff9700",
    redOrange: "#ff6003",
    green: "#008e5e",
    darkGreen: "#256646",

    // Utility Colors
    cyan: "#4ac7eb",

    // Neutral Colors
    white: "#ffffff",
    lightGrey: "#f7f7f7",
    darkGrey: "#222222",
    borderGrey: "#cccccc",
  },
}

// ADD THIS NEW OBJECT
export const mediaTypeTheme = {
  colors: {
    television: "#D92E2E",
    radio: "#ffcf2a",
    newspaper: "#6EE7B7",
    magazines: "#fd7adb",
    ooh: "#008e5e",
    cinema: "#A41D23",
    digidisplay: "#ff6003",
    digiaudio: "#F43F5E",
    digivideo: "#2563EB",
    bvod: "#472477",
    integration: "#4A5568",
    search: "#4f8fcb",
    socialmedia: "#4ac7eb",
    progdisplay: "#ff9700",
    progvideo: "#1E40AF",
    progbvod: "#9801b5",
    progaudio: "#BE185D",
    progooh: "#b5d337",
    influencers: "#15c7c9",
    /** Consulting / production line items (aligned with dashboard greys) */
    production: "#64748B",
  },
}

