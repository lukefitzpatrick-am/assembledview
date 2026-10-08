/** @type {import('tailwindcss').Config} */

const brand = require("./lib/brand/tokens.json")

/**
 * Flat utilities that still have class uses. They do not follow `.dark`.
 * Values come from lib/brand/tokens.json. Unused keys were removed (D18 / DS-11).
 */
const brandPalette = {
  "primary-hover": brand.derived.forestHover,
  "accent-hover": brand.derived.limeHover,
  success: brand.colour.forest,
  info: brand.colour.sky,
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
    "ahead-fg": "var(--status-ahead-fg)",
    "on-track-fg": "var(--status-on-track-fg)",
    "behind-fg": "var(--status-behind-fg)",
    "critical-fg": "var(--status-critical-fg)",
    /* Meaning aliases → pacing (good/attention/blocking) */
    good: "var(--status-good)",
    "good-bg": "var(--status-good-bg)",
    "good-fg": "var(--status-good-fg)",
    attention: "var(--status-attention)",
    "attention-bg": "var(--status-attention-bg)",
    "attention-fg": "var(--status-attention-fg)",
    blocking: "var(--status-blocking)",
    "blocking-bg": "var(--status-blocking-bg)",
    "blocking-fg": "var(--status-blocking-fg)",
  },
  action: {
    DEFAULT: "hsl(var(--action))",
    foreground: "hsl(var(--action-foreground))",
    hover: "hsl(var(--action-hover))",
  },
  channel: {
    tv: "var(--channel-tv)",
    bvod: "var(--channel-bvod)",
    "bvod-bg": "var(--channel-bvod-bg)",
    social: "var(--channel-social)",
    "social-bg": "var(--channel-social-bg)",
    "social-fg": "var(--channel-social-fg)",
    progDisplay: "var(--channel-prog-display)",
    search: "var(--channel-search)",
    ooh: "var(--channel-ooh)",
  },
  audience: {
    1: "var(--audience-1)",
    2: "var(--audience-2)",
    3: "var(--audience-3)",
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
    cardInner: "var(--dashboard-card-inner)",
  },
  pacing: {
    ahead: "var(--pacing-ahead)",
    "ahead-bg": "var(--pacing-ahead-bg)",
    "on-track": "var(--pacing-on-track)",
    "on-track-bg": "var(--pacing-on-track-bg)",
    behind: "var(--pacing-behind)",
    "behind-bg": "var(--pacing-behind-bg)",
    critical: "var(--pacing-critical)",
    "critical-bg": "var(--pacing-critical-bg)",
  },
  tone: {
    outcome: "var(--tone-outcome)",
    "outcome-bg": "var(--tone-outcome-bg)",
    "outcome-fg": "var(--tone-outcome-fg)",
    insight: "var(--tone-insight)",
    "insight-bg": "var(--tone-insight-bg)",
    "insight-fg": "var(--tone-insight-fg)",
    action: "var(--tone-action)",
    "action-bg": "var(--tone-action-bg)",
    "action-fg": "var(--tone-action-fg)",
    attention: "var(--tone-attention)",
    "attention-bg": "var(--tone-attention-bg)",
    "attention-fg": "var(--tone-attention-fg)",
    critical: "var(--tone-critical)",
    "critical-bg": "var(--tone-critical-bg)",
    "critical-fg": "var(--tone-critical-fg)",
    neutral: "var(--tone-neutral)",
    "neutral-bg": "var(--tone-neutral-bg)",
    "neutral-fg": "var(--tone-neutral-fg)",
    ink: "var(--tone-ink)",
    "ink-bg": "var(--tone-ink-bg)",
    "ink-fg": "var(--tone-ink-fg)",
  },
  "text-secondary": "var(--text-secondary)",
  "text-tertiary": "var(--text-tertiary)",
  "fill-track": "var(--fill-track)",
  "row-hover": "var(--row-hover)",
  canvas: "var(--canvas)",
}

module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
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
        sans: ["var(--font-jakarta)", ...brand.font.sansFallback],
        serif: ["var(--font-instrument-serif)", ...brand.font.serifFallback],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ...brandPalette,
        ...semanticColors,
        am: {
          ink: brand.colour.ink,
          white: brand.colour.white,
          sand: brand.colour.sand,
          lime: brand.colour.lime,
          sky: brand.colour.sky,
          forest: brand.colour.forest,
          "forest-light": brand.colour.forestLight,
          panel: brand.colour.panel,
          context: brand.colour.context,
          "context-black": brand.colour.contextBlack,
          line: brand.colour.line,
          muted: brand.colour.muted,
          "muted-on-black": brand.colour.mutedOnBlack,
          body: brand.colour.body,
          amber: brand.functional.amber,
          coral: brand.functional.coral,
        },
      },
      ringOffsetColor: {
        sidebar: "hsl(var(--sidebar-background))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
        frame: "var(--radius-frame)",
        pill: "var(--radius-pill)",
      },
      /**
       * Overlay stacking scale (MB-29). Documented in lib/ui/stackingLayers.ts.
       * Same-tier rule: a surface opened from inside another must use a higher
       * layer — never rely on portal DOM order among peers.
       * eg-* tokens are in-surface (ExpertGrid), not the overlay ladder.
       */
      zIndex: {
        chrome: "40",
        assistant: "50",
        modal: "60",
        nested: "70",
        popover: "80",
        tooltip: "90",
        toast: "100",
        "eg-under": "1",
        "eg-ring-lo": "5",
        "eg-ring": "6",
        "eg-ring-hi": "7",
        "eg-sticky-week": "10",
        "eg-resize": "15",
        "eg-sticky": "20",
        "eg-cell-float": "30",
        "eg-hint": "35",
        "eg-cell-float-hi": "40",
      },
      boxShadow: {
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "none",
        xl: "none",
        "2xl": "none",
        inner: "none",
        card: "none",
        "card-hover": "none",
        tooltip: "0 10px 40px rgba(0,0,0,0.15)",
        "glow-success": "none",
        "glow-danger": "none",
        e0: "none",
        e1: "none",
        e2: "0 8px 24px rgba(15,29,19,.12)",
        frame: "none",
        hero: "none",
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
