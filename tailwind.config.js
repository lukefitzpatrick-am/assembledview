/** @type {import('tailwindcss').Config} */

/**
 * Brand / marketing palette (hex). Kept flat so utilities stay the same
 * (e.g. bg-primary-hover, text-brand, bg-success).
 */
const brandPalette = {
  "primary-hover": "#3a7ab6",
  "secondary-hover": "#12b1b3",
  "accent-hover": "#a2be31",
  brand: "#9801b5",
  "brand-dark": "#472477",
  highlight: "#fd7adb",
  warning: "#ffcf2a",
  "warning-hover": "#e6b925",
  alert: "#ff9700",
  error: "#ff6003",
  "error-hover": "#e65603",
  success: "#008e5e",
  "success-hover": "#007a50",
  "success-dark": "#256646",
  info: "#4ac7eb",
  "info-hover": "#42b3d4",
  "background-secondary": "#f7f7f7",
  darkGrey: "#222222",
  /** Client / pacing shell background */
  "dashboard-surface": "#DEE5F4",
  /** Lime CTA (matches lib/utils limeGreen) */
  lime: "#b5d337",
}

/** Semantic tokens for shadcn/ui — driven by CSS variables in app/globals.css */
const semanticColors = {
  border: "hsl(var(--border))",
  input: "hsl(var(--input))",
  ring: "hsl(var(--ring))",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  app: {
    bg: "hsl(var(--app-bg))",
    fg: "hsl(var(--app-fg))",
  },
  surface: {
    panel: "hsl(var(--surface-panel))",
    muted: "hsl(var(--surface-muted))",
    elevated: "hsl(var(--surface-elevated))",
    input: "hsl(var(--surface-input))",
    popover: "hsl(var(--surface-popover))",
  },
  table: {
    row: "hsl(var(--table-row))",
    hover: "hsl(var(--table-row-hover))",
    active: "hsl(var(--table-row-active))",
  },
  state: {
    active: "hsl(var(--state-active))",
  },
  status: {
    success: "hsl(var(--status-success))",
    "success-foreground": "hsl(var(--status-success-foreground))",
    warning: "hsl(var(--status-warning))",
    "warning-foreground": "hsl(var(--status-warning-foreground))",
    danger: "hsl(var(--status-danger))",
    "danger-foreground": "hsl(var(--status-danger-foreground))",
    accent: "hsl(var(--status-accent))",
    "accent-foreground": "hsl(var(--status-accent-foreground))",
  },
  primary: {
    DEFAULT: "hsl(var(--primary))",
    foreground: "hsl(var(--primary-foreground))",
  },
  secondary: {
    DEFAULT: "hsl(var(--secondary))",
    foreground: "hsl(var(--secondary-foreground))",
  },
  destructive: {
    DEFAULT: "hsl(var(--destructive))",
    foreground: "hsl(var(--destructive-foreground))",
  },
  muted: {
    DEFAULT: "hsl(var(--muted))",
    foreground: "hsl(var(--muted-foreground))",
  },
  accent: {
    DEFAULT: "hsl(var(--accent))",
    foreground: "hsl(var(--accent-foreground))",
  },
  popover: {
    DEFAULT: "hsl(var(--popover))",
    foreground: "hsl(var(--popover-foreground))",
  },
  card: {
    DEFAULT: "hsl(var(--card))",
    foreground: "hsl(var(--card-foreground))",
  },
  sidebar: {
    DEFAULT: "hsl(var(--sidebar-background))",
    foreground: "hsl(var(--sidebar-foreground))",
    primary: "hsl(var(--sidebar-primary))",
    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
    accent: "hsl(var(--sidebar-accent))",
    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
    border: "hsl(var(--sidebar-border))",
    ring: "hsl(var(--sidebar-ring))",
  },
  dashboard: {
    surface: "var(--dashboard-surface)",
    card: "var(--dashboard-card)",
    cardHover: "var(--dashboard-card-hover)",
    border: "var(--dashboard-border)",
    borderHover: "var(--dashboard-border-hover)",
  },
  pacing: {
    ahead: "var(--pacing-ahead)",
    aheadBg: "var(--pacing-ahead-bg)",
    onTrack: "var(--pacing-on-track)",
    onTrackBg: "var(--pacing-on-track-bg)",
    behind: "var(--pacing-behind)",
    behindBg: "var(--pacing-behind-bg)",
    critical: "var(--pacing-critical)",
    criticalBg: "var(--pacing-critical-bg)",
  },
}

module.exports = {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        "3xl": "1920px",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ...brandPalette,
        ...semanticColors,
      },
      ringOffsetColor: {
        sidebar: "hsl(var(--sidebar-background))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
        tooltip: "0 10px 40px rgba(0,0,0,0.15)",
        "glow-success": "0 0 20px rgba(16, 185, 129, 0.3)",
        "glow-danger": "0 0 20px rgba(239, 68, 68, 0.3)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
