/** @type {import('tailwindcss').Config} */
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
      colors: {
        // Primary Colors
        primary: "#4f8fcb", // Blue
        "primary-hover": "#3a7ab6",
        secondary: "#15c7c9", // Teal
        "secondary-hover": "#12b1b3",
        accent: "#b5d337", // Lime Green
        "accent-hover": "#a2be31",
        brand: "#9801b5", // Purple
        "brand-dark": "#472477", // Deep Purple

        // Secondary & Accent Colors
        highlight: "#fd7adb", // Pink
        warning: "#ffcf2a", // Yellow
        "warning-hover": "#e6b925",
        alert: "#ff9700", // Orange
        error: "#ff6003", // Red-Orange
        "error-hover": "#e65603",
        success: "#008e5e", // Green
        "success-hover": "#007a50",
        "success-dark": "#256646", // Dark Green

        // Utility Colors
        info: "#4ac7eb", // Cyan
        "info-hover": "#42b3d4",

        // Neutral Colors
        background: "#ffffff",
        "background-secondary": "#f7f7f7",
        foreground: "#222222",
        border: "#cccccc",
        darkGrey: "#222222",

        // Semantic Colors for shadcn components
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

