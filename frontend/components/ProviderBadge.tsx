import type { Provider } from "@/lib/types";

const LABEL: Record<Provider, string> = {
  bob: "Bob",
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  system: "System",
};

// Bob is deliberately the most visually prominent — it's the structurally
// load-bearing engine (Plan-mode decomposition + primary headless path),
// not just one adapter among equals.
const STYLE: Record<Provider, string> = {
  bob: "bg-state-orchestration/15 text-state-orchestration border-state-orchestration/40",
  claude_code: "bg-state-inactive/10 text-state-inactive border-state-inactive/30",
  codex: "bg-state-inactive/10 text-state-inactive border-state-inactive/30",
  gemini: "bg-state-inactive/10 text-state-inactive border-state-inactive/30",
  system: "bg-state-inactive/10 text-state-inactive border-state-inactive/30",
};

export function ProviderBadge({ provider }: { provider: Provider }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium ${STYLE[provider]}`}
    >
      {LABEL[provider]}
    </span>
  );
}
