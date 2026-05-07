import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // NGen Connect brand colours
        "ngen-red": "#C8102E",
        "ngen-dark": "#1a1a2e",
        "ngen-navy": "#0f1629",
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
          DEFAULT: "#F15A22",
          muted: "rgba(241, 90, 34, 0.12)",
        },
        border: "var(--border)",
        "border-hover": "var(--border-hover)",
        positive: { DEFAULT: "var(--positive)", muted: "var(--positive-muted)" },
        negative: { DEFAULT: "var(--negative)", muted: "var(--negative-muted)" },
        warn:     { DEFAULT: "var(--warn)",     muted: "var(--warn-muted)"     },
      },
      fontFamily: {
        sans:    ['"DM Sans"',        "system-ui", "sans-serif"],
        display: ['"Space Grotesk"',  "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "fade-in":  "fadeIn 0.4s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
