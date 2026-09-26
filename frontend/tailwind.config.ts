import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080D18",
          900: "#0B0F1A",
          800: "#101624",
          700: "rgba(255,255,255,0.05)",
          600: "rgba(255,255,255,0.07)",
        },
        parchment: "#E8ECF5",
        state: {
          orchestration: "#8175E8",
          running: "#3ECFB2",
          warning: "#D9A441",
          conflict: "#EA7568",
          inactive: "#7E899F",
          // secondary accent for status/badges
          info: "#9AA5B9",
        },
        muted: "#7E899F",
        // gradient accent colors
        accent: {
          blue: "#7189B5",
          indigo: "#8175E8",
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
        card: "0 12px 32px -24px rgba(0,0,0,0.72)",
        "card-active": "0 0 0 1px rgba(129,117,232,0.45), 0 4px 24px -10px rgba(129,117,232,0.22)",
        node: "0 10px 24px -16px rgba(0,0,0,0.8)",
      },
    },
  },
  plugins: [],
};

export default config;
