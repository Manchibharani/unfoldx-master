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
        state: {
          orchestration: "#9585E8",
          running: "#4FB8A6",
          warning: "#D9A441",
          conflict: "#EA7568",
          inactive: "#A4ADBA",
        },
        muted: "#A4ADBA",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
