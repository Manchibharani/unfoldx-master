import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080D18",
          900: "#0D1525",
          800: "#121E33",
          700: "#1A2847",
          600: "#243357",
        },
        parchment: "#E8EDF5",
        state: {
          orchestration: "#7C6EE8",
          running: "#3ECFB2",
          warning: "#D9A441",
          conflict: "#EA7568",
          inactive: "#8A96A8",
          // secondary accent for status/badges
          info: "#3B8EE8",
        },
        muted: "#8A96A8",
        // gradient accent colors
        accent: {
          blue: "#3B8EE8",
          indigo: "#7C6EE8",
          teal: "#3ECFB2",
        },
        // per-provider brand colors
        provider: {
          bob: "#7C6EE8",
          claude: "#D97B5A",
          chatgpt: "#19C37D",
          antigravity: "#3B8EE8",
          system: "#8A96A8",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 2px 12px -4px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
        "card-active": "0 0 0 1.5px #3B8EE8, 0 4px 24px -6px rgba(59,142,232,0.3)",
        node: "0 4px 20px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
