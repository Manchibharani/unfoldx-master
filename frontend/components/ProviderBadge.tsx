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
  bob: "bg-ledger-gold/15 text-ledger-gold border-ledger-gold/40",
  claude_code: "bg-ledger-teal/15 text-ledger-teal border-ledger-teal/40",
  codex: "bg-ledger-violet/10 text-ledger-violet border-ledger-violet/30",
  gemini: "bg-muted/10 text-muted border-muted/30",
  system: "bg-muted/10 text-muted border-muted/30",
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
