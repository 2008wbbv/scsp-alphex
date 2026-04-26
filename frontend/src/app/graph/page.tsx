"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Network } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const STATUS_COLOR: Record<string, string> = {
  unread:  "#9ca3af",
  reading: "#0b0b0e",
  read:    "#0b0b0e",
  queued:  "#0b0b0e",
};

const STATUS_LABEL: Record<string, string> = {
  unread:  "text-muted",
  reading: "text-fg",
  read:    "text-fg",
  queued:  "text-fg",
};

export default function GraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({
    nodes: [],
    links: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    api
      .getPaperGraph()
      .then(({ nodes, edges }) => {
        setGraphData({
          nodes: nodes.map((n) => ({ ...n, val: 4 })),
          links: edges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.similarity,
          })),
        });
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-fg">
              Paper graph
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Nodes connect when cosine similarity &gt; 0.6. Click a node to inspect it.
            </p>
          </div>
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                {s}
              </span>
            ))}
          </div>
        </header>

        {error && <div className="text-sm text-red-300">{error}</div>}

        <div
          ref={containerRef}
          className="relative h-[600px] w-full overflow-hidden rounded-xl border border-border bg-[#0d0d11]"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Network size={32} className="mx-auto mb-3 text-muted/30 animate-pulse" />
                <div className="text-sm text-muted">Building graph…</div>
              </div>
            </div>
          ) : graphData.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Network size={32} className="mx-auto mb-3 text-muted/30" />
                <div className="text-sm font-medium text-fg">No papers yet</div>
                <div className="mt-1 text-xs text-muted">Add papers to your library to see the similarity graph</div>
              </div>
            </div>
          ) : (
            <ForceGraph2D
              width={dims.width}
              height={dims.height}
              graphData={graphData}
              nodeLabel="title"
              nodeColor={(n: any) => STATUS_COLOR[n.status] ?? STATUS_COLOR.unread}
              nodeVal={(n: any) => n.val}
              linkWidth={(l: any) => (l.value ?? 0.5) * 2.5}
              linkColor={() => "rgba(11,11,14,0.2)"}
              backgroundColor="transparent"
              onNodeClick={(node: any) => setSelected(node)}
              nodeCanvasObjectMode={() => "after"}
              nodeCanvasObject={(
                node: any,
                ctx: CanvasRenderingContext2D,
                globalScale: number
              ) => {
                if (globalScale < 0.7) return;
                const label = node.title?.length > 28 ? node.title.slice(0, 28) + "…" : node.title;
                const fontSize = 10 / globalScale;
                ctx.font = `${fontSize}px Inter, sans-serif`;
                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.textAlign = "center";
                ctx.fillText(label, node.x, node.y + 11 / globalScale);
              }}
            />
          )}
        </div>

        {selected && (
          <div className="animate-fade-up rounded-xl border border-border bg-panel p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg">{selected.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                {selected.authors?.slice(0, 2).join(", ")}
                {selected.year ? ` · ${selected.year}` : ""}
                <span className={`font-medium ${STATUS_LABEL[selected.status] ?? "text-muted"}`}>
                  · {selected.status}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href={`/papers/${selected.id}`} className="btn btn-primary text-xs">
                Open paper
              </Link>
              <button onClick={() => setSelected(null)} className="btn text-xs">
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
