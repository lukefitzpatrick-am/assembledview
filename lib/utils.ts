import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
  },
}

