import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#ffffff",
        panel: "#f6f6f9",
        panel2: "#eeeef3",
        border: "#e0e0e8",
        accent: "#0b0b0e",
        accent2: "#059669",
        muted: "#6b7280",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
