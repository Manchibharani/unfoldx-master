import type { Provider } from "@/lib/types";
import { ProviderLogo } from "./ProviderLogo";

const LABEL: Record<Provider, string> = {
  bob: "Bob",
  claude_code: "Claude",
  codex: "ChatGPT",
  github_copilot: "GitHub Copilot",
  gemini: "Antigravity",
  system: "System",
};

// Per-provider distinct accent colors — not monochrome
const STYLE: Record<Provider, { border: string; bg: string; text: string }> = {
  bob: { border: "rgba(124,110,232,0.45)", bg: "rgba(124,110,232,0.12)", text: "#9585F0" },
  claude_code: { border: "rgba(199,205,212,0.40)", bg: "rgba(199,205,212,0.10)", text: "#C7CDD4" },
  codex: { border: "rgba(16,163,127,0.40)", bg: "rgba(16,163,127,0.10)", text: "#10A37F" },
  github_copilot: { border: "rgba(155,108,255,0.40)", bg: "rgba(155,108,255,0.10)", text: "#9B6CFF" },
  gemini: { border: "rgba(59,142,232,0.40)", bg: "rgba(59,142,232,0.10)", text: "#3B8EE8" },
  system: { border: "rgba(138,150,168,0.30)", bg: "rgba(138,150,168,0.08)", text: "#8A96A8" },
};

export function ProviderBadge({
  provider,
  logoOnly = false,
  size = 12,
}: {
  provider: Provider;
  logoOnly?: boolean;
  size?: number;
}) {
  const s = STYLE[provider] ?? STYLE.system;
  const label = LABEL[provider] ?? "Unknown";
  return (
    <span
      title={logoOnly ? label : undefined}
      aria-label={logoOnly ? label : undefined}
      className={`inline-flex items-center rounded-full border ${
        logoOnly ? "p-1" : "gap-1.5 px-2 py-0.5 text-xs font-medium"
      }`}
      style={{ borderColor: s.border, backgroundColor: s.bg, color: s.text }}
    >
      <ProviderLogo provider={provider} size={size} />
      {!logoOnly && label}
    </span>
  );
}
