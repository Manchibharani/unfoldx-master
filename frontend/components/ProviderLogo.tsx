import Image from "next/image";
import type { Provider } from "@/lib/types";

const LOGO_PATH: Partial<Record<Provider, string>> = {
  bob: "/logos/bob.png",
  claude_code: "/logos/opencode.svg",
  codex: "/logos/codex.webp",
  github_copilot: "/logos/github-copilot.svg",
  gemini: "/logos/gemini.png",
};

function SystemLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#1A2847" />
      <circle cx="12" cy="12" r="5" stroke="#8A96A8" strokeWidth="1.5" fill="none" />
      <line x1="12" y1="7" x2="12" y2="9" stroke="#8A96A8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="15" x2="12" y2="17" stroke="#8A96A8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="12" x2="9" y2="12" stroke="#8A96A8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="12" x2="17" y2="12" stroke="#8A96A8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProviderLogo({
  provider,
  size = 16,
}: {
  provider: Provider;
  size?: number;
}) {
  const src = LOGO_PATH[provider];
  if (!src) return <SystemLogo size={size} />;

  if (provider === "claude_code") {
    return (
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt=""
          aria-hidden
          width={Math.round(size * 0.8)}
          height={size}
          unoptimized
          className="h-full w-auto max-w-full object-contain"
        />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded-md object-contain"
    />
  );
}
