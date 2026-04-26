import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: false,
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "rgb(var(--color-ink)    / <alpha-value>)",
        panel:  "rgb(var(--color-panel)  / <alpha-value>)",
        panel2: "rgb(var(--color-panel2) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        accent:  "#0b0b0e",
        accent2: "#0b0b0e",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        fg:    "rgb(var(--color-fg)    / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "ui-monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
