import Image from "next/image";
import type { PluginId } from "@/lib/plugins";

const PLUGINS: { id: PluginId; label: string; icon: string; color: string }[] = [
  { id: "canva", label: "Canva", icon: "/logos/canva.svg", color: "#7D2AE7" },
  { id: "github", label: "GitHub", icon: "/logos/github.svg", color: "#0FBF3E" },
];

export function PluginsPanel({ onOpenPlugin }: { onOpenPlugin: (plugin: PluginId) => void }) {
  return (
    <aside className="mt-3 min-w-0 overflow-hidden rounded-xl bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-state-info">Plugins</h2>
        <span className="px-1.5 text-[10px] tabular-nums text-muted">{PLUGINS.length}</span>
      </div>

      <ul className="flex gap-2 overflow-x-auto p-3 xl:flex-col xl:overflow-visible xl:p-3">
        {PLUGINS.map((plugin) => (
          <li key={plugin.id} className="flex min-w-[200px] items-stretch gap-1 xl:min-w-0">
            <button
              type="button"
              title={plugin.label}
              onClick={() => onOpenPlugin(plugin.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 hover:bg-white/[0.035]"
            >
              <Image
                src={plugin.icon}
                alt=""
                aria-hidden
                width={26}
                height={26}
                unoptimized
                className="h-[26px] w-[26px] shrink-0 rounded-md object-contain"
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: plugin.color }}>
                {plugin.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}