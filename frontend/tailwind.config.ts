import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B0F17",
          900: "#0F1420",
          800: "#161D2C",
          700: "#1F283B",
          600: "#2B3651",
        },
        parchment: "#E8E6DE",
        muted: "#8A93A6",
        ledger: {
          gold: "#D9A441",
          teal: "#4FB8A6",
          coral: "#E2685A",
          violet: "#8D7BE0",
        },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
