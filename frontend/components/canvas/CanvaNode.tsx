import Image from "next/image";
import type { NodeProps } from "@xyflow/react";
import type { CanvasPluginPanel } from "@/lib/plugins";

const CANVA_EMBED_URL = "";

type CanvaNodeData = {
  panel: CanvasPluginPanel;
  onRemoveNode: (nodeId: string) => void;
};

function MockDesignPreview() {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-[#F0EBFA] p-[5%]">
      <div className="relative h-full overflow-hidden bg-white p-[7%] shadow-sm">
        <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#7D2AE7]">Field notes · 2026</p>
        <div className="mt-[4%] flex items-end justify-between gap-3">
          <h2 className="max-w-[62%] text-[clamp(18px,2.5vw,30px)] font-semibold leading-[1.05] text-[#20202A]">
            Make room for good ideas.
          </h2>
          <div className="h-[38%] w-[29%] rounded-t-full bg-gradient-to-b from-[#B88AF4] to-[#7950E8]" />
        </div>
        <div className="mt-[5%] h-1 w-[42%] rounded-full bg-[#D4C1F3]" />
        <div className="mt-[2%] h-1 w-[29%] rounded-full bg-[#E7E2EF]" />
        <div className="absolute bottom-[7%] left-[7%] text-[7px] text-[#77727F]">DRAFT 01</div>
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-ink-900/90 px-2.5 py-1 text-[9px] font-medium text-parchment shadow-lg">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-state-running" />
        Live preview · mock
      </div>
    </div>
  );
}

export function CanvaNode({ data }: NodeProps) {
  const { panel, onRemoveNode } = data as unknown as CanvaNodeData;

  return (
    <section className="w-[420px] overflow-hidden rounded-xl border border-[#7D2AE7]/35 bg-ink-900 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.9)]">
      <header className="flex items-center justify-between border-b border-ink-700 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image src="/logos/canva.svg" alt="" aria-hidden width={25} height={25} unoptimized className="h-[25px] w-[25px] shrink-0 rounded-md object-cover" />
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold text-[#B88AF4]">Canva · Live design</h2>
            <p className="text-[9px] text-muted">Draft session · Preview only</p>
          </div>
        </div>
        <button
          type="button"
          className="nodrag rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-parchment"
          title="Close Canva panel"
          aria-label="Close Canva panel"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveNode(panel.id);
          }}
        >
          ×
        </button>
      </header>

      <div className="nodrag nopan m-3 rounded-lg border border-white/[0.07] bg-[#131722] p-2">
        <div className="mb-2 flex items-center gap-2 px-1 text-[9px] text-muted">
          <span className="flex gap-1">
            <i className="h-1.5 w-1.5 rounded-full bg-[#EA7568]" />
            <i className="h-1.5 w-1.5 rounded-full bg-[#D9A441]" />
            <i className="h-1.5 w-1.5 rounded-full bg-[#3ECFB2]" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded bg-ink-800 px-2 py-1">canva.com/design/live-preview</span>
          <span className="uppercase text-[#B88AF4]">Design</span>
        </div>
        {CANVA_EMBED_URL ? (
          <iframe
            title="Canva design preview"
            src={CANVA_EMBED_URL}
            className="aspect-[16/10] w-full rounded-md border-0 bg-white"
            allowFullScreen
          />
        ) : (
          <MockDesignPreview />
        )}
      </div>
    </section>
  );
}