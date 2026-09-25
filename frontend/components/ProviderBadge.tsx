import type { Provider } from "@/lib/types";
import { ProviderLogo } from "./ProviderLogo";

const LABEL: Record<Provider, string> = {
  bob: "Bob",
  claude_code: "Claude",
  codex: "ChatGPT",
  gemini: "Antigravity",
  system: "System",
};

// Per-provider distinct accent colors — not monochrome
const STYLE: Record<Provider, { border: string; bg: string; text: string }> = {
  bob: { border: "rgba(124,110,232,0.45)", bg: "rgba(124,110,232,0.12)", text: "#9585F0" },
  claude_code: { border: "rgba(217,123,90,0.40)", bg: "rgba(217,123,90,0.10)", text: "#D97B5A" },
  codex: { border: "rgba(25,195,125,0.40)", bg: "rgba(25,195,125,0.10)", text: "#19C37D" },
  gemini: { border: "rgba(59,142,232,0.40)", bg: "rgba(59,142,232,0.10)", text: "#3B8EE8" },
  system: { border: "rgba(138,150,168,0.30)", bg: "rgba(138,150,168,0.08)", text: "#8A96A8" },
};

export function ProviderBadge({ provider }: { provider: Provider }) {
  const s = STYLE[provider] ?? STYLE.system;
  const label = LABEL[provider] ?? "Unknown";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: s.border, backgroundColor: s.bg, color: s.text }}
    >
      <ProviderLogo provider={provider} size={12} />
      {label}
    </span>
  );
}
