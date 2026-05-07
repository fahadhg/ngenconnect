import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // NGen brand colours - modern & sleek
        "ngen-navy": "#0A1628",
        "ngen-orange": "#FF6B35",
        "ngen-red": "#C8102E",
        "ngen-dark": "#1a1a2e",
        // Trade Intelligence (ResilienceHQ) dark-theme tokens
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          muted: "var(--accent-muted)",
        },
        ngen: {
          DEFAULT: "#FF6B35",
          muted: "rgba(255, 107, 53, 0.08)",
        },
        border: "var(--border)",
        "border-hover": "var(--border-hover)",
        positive: { DEFAULT: "var(--positive)", muted: "var(--positive-muted)" },
        negative: { DEFAULT: "var(--negative)", muted: "var(--negative-muted)" },
        warn:     { DEFAULT: "var(--warn)",     muted: "var(--warn-muted)"     },
      },
      fontFamily: {
        sans:    ['"DM Sans"',        "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans"',  "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "fade-in":  "fadeIn 0.4s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "pulse-ring": "pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "bounce-subtle": "bounceSubtle 2s infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(255, 107, 53, 0.7)" },
          "70%": { boxShadow: "0 0 0 10px rgba(255, 107, 53, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255, 107, 53, 0)" },
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      boxShadow: {
        "sm-soft": "0 1px 3px rgba(0, 0, 0, 0.08)",
        "md-soft": "0 4px 12px rgba(0, 0, 0, 0.10)",
        "lg-soft": "0 10px 24px rgba(0, 0, 0, 0.12)",
        "card": "0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
