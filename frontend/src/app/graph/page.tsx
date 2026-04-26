"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const STATUS_COLOR: Record<string, string> = {
  unread: "#6b7280",
  reading: "#6366f1",
  read: "#22c55e",
  queued: "#f59e0b",
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
        <header>
          <h1 className="text-2xl font-semibold text-white">Paper graph</h1>
          <p className="text-sm text-muted">
            Papers are connected when cosine similarity &gt; 0.6. Click a node to
            select it.
          </p>
        </header>

        <div className="flex gap-4 text-xs text-muted">
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: c }}
              />
              {s}
            </span>
          ))}
        </div>

        {error && <div className="text-sm text-red-300">{error}</div>}

        <div
          ref={containerRef}
          className="relative h-[600px] w-full overflow-hidden rounded-lg border border-border bg-panel/30"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted">
              Loading graph…
            </div>
          ) : graphData.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted">
              Add papers to your library to see the graph.
            </div>
          ) : (
            <ForceGraph2D
              width={dims.width}
              height={dims.height}
              graphData={graphData}
              nodeLabel="title"
              nodeColor={(n: any) =>
                STATUS_COLOR[n.status] ?? STATUS_COLOR.unread
              }
              nodeVal={(n: any) => n.val}
              linkWidth={(l: any) => (l.value ?? 0.5) * 3}
              linkColor={() => "rgba(99,102,241,0.35)"}
              backgroundColor="transparent"
              onNodeClick={(node: any) => setSelected(node)}
              nodeCanvasObjectMode={() => "after"}
              nodeCanvasObject={(
                node: any,
                ctx: CanvasRenderingContext2D,
                globalScale: number
              ) => {
                if (globalScale < 0.7) return;
                const label =
                  node.title?.length > 26
                    ? node.title.slice(0, 26) + "…"
                    : node.title;
                const fontSize = 11 / globalScale;
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = "rgba(255,255,255,0.85)";
                ctx.textAlign = "center";
                ctx.fillText(label, node.x, node.y + 10 / globalScale);
              }}
            />
          )}
        </div>

        {selected && (
          <div className="card flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">
                {selected.title}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {(selected.authors ?? []).slice(0, 3).join(", ")}
                {selected.year ? ` · ${selected.year}` : ""}
                {` · ${selected.status}`}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/papers/${selected.id}`}
                className="btn btn-primary text-xs"
              >
                Open paper
              </Link>
              <button onClick={() => setSelected(null)} className="chip">
                dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
