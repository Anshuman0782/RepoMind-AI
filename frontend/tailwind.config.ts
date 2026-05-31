import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        panel: "var(--color-panel)",
        line: "var(--color-line)",
        accent: "var(--color-accent)",
        "accent-dim": "var(--color-accent-dim)",
        "emerald-dim": "var(--color-emerald-dim)",
        "amber-dim": "var(--color-amber-dim)",
        "rose-dim": "var(--color-rose-dim)",
        textPrimary: "var(--color-text-primary)",
        textSecondary: "var(--color-text-secondary)",
        textMuted: "var(--color-text-muted)",
        brand: {
          bg: "var(--color-brand-bg)",
          card: "var(--color-brand-card)",
          sidebar: "var(--color-brand-sidebar)",
          accent: "var(--color-brand-accent)",
          accentLight: "var(--color-brand-accent-light)",
          border: "var(--color-brand-border)",
          glow: "var(--color-brand-glow)",
        }
      },
    },
  },
  plugins: [],
};

export default config;
