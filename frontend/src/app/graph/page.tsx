"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, Image, Network, X } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type Tab = "similarity" | "images" | "generate";

export default function GraphPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("similarity");

  useEffect(() => {
    api.listPapers().then(({ papers }) => setPapers(papers ?? [])).catch(() => {});
  }, []);

  const selectedPaper = papers.find((p) => p.id === selectedId) ?? null;

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-fg">Graphs</h1>
            <p className="mt-0.5 text-sm text-muted">
              Similarity graph, figure library, and AI chart generation.
            </p>
          </div>
        </header>

        {/* Paper selector */}
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="shrink-0 text-muted" />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 max-w-sm rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:border-fg/40"
          >
            <option value="">All papers (similarity graph)</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {selectedId && (
            <button onClick={() => setSelectedId("")} className="text-muted hover:text-fg">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { id: "similarity" as Tab, label: "Similarity graph", icon: Network },
            { id: "images" as Tab, label: "Figure library", icon: Image, disabled: !selectedId },
            { id: "generate" as Tab, label: "Generate charts", icon: BarChart3 },
          ].map(({ id, label, icon: Icon, disabled }) => (
            <button
              key={id}
              onClick={() => !disabled && setTab(id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-all -mb-px ${
                tab === id
                  ? "border-fg text-fg"
                  : disabled
                  ? "border-transparent text-muted/40 cursor-not-allowed"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {tab === "similarity" && <SimilarityGraph paperId={selectedId || null} />}
        {tab === "images" && selectedPaper && <FigureLibrary paper={selectedPaper} />}
        {tab === "generate" && <GenerateCharts paper={selectedPaper} />}
      </div>
    </Shell>
  );
}

/* ── Similarity graph ─────────────────────────────────────────────── */
function SimilarityGraph({ paperId }: { paperId: string | null }) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 520 });

  useEffect(() => {
    setLoading(true);
    api.getPaperGraph()
      .then(({ nodes, edges }) => {
        const filtered = paperId
          ? nodes.filter((n) => n.id === paperId || edges.some(
              (e) => (e.source === paperId && e.target === n.id) || (e.target === paperId && e.source === n.id)
            ))
          : nodes;
        const filteredIds = new Set(filtered.map((n: any) => n.id));
        setGraphData({
          nodes: filtered.map((n: any) => ({ ...n, val: 4 })),
          links: edges
            .filter((e: any) => filteredIds.has(e.source) && filteredIds.has(e.target))
            .map((e: any) => ({ source: e.source, target: e.target, value: e.similarity })),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [paperId]);

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
    <>
      <div
        ref={containerRef}
        className="relative h-[520px] w-full overflow-hidden rounded-xl border border-border bg-[#fafaf9]"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Building graph…
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No papers yet — add papers to see the similarity graph.
          </div>
        ) : (
          <ForceGraph2D
            width={dims.width}
            height={dims.height}
            graphData={graphData}
            nodeLabel="title"
            nodeColor={() => "#18181b"}
            nodeVal={(n: any) => n.val}
            linkWidth={(l: any) => (l.value ?? 0.5) * 2}
            linkColor={() => "rgba(24,24,27,0.15)"}
            backgroundColor="transparent"
            onNodeClick={(node: any) => setSelected(node)}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, gs: number) => {
              if (gs < 0.7) return;
              const label = node.title?.length > 28 ? node.title.slice(0, 28) + "…" : node.title;
              ctx.font = `${10 / gs}px Inter, sans-serif`;
              ctx.fillStyle = "rgba(24,24,27,0.7)";
              ctx.textAlign = "center";
              ctx.fillText(label, node.x, node.y + 11 / gs);
            }}
          />
        )}
      </div>
      {selected && (
        <div className="animate-fade-up rounded-xl border border-border bg-panel p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">{selected.title}</div>
            <div className="mt-0.5 text-xs text-muted">
              {selected.authors?.slice(0, 2).join(", ")}{selected.year ? ` · ${selected.year}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href={`/papers/${selected.id}`} className="btn btn-primary text-xs">Open</Link>
            <button onClick={() => setSelected(null)} className="btn text-xs">Dismiss</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Figure library ───────────────────────────────────────────────── */
function FigureLibrary({ paper }: { paper: any }) {
  const [charts, setCharts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const { charts } = await api.chartsFromPaper(paper.id) as { charts: any[] };
      setCharts(charts);
      setGenerated(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Claude extracts quantitative data from <span className="font-medium text-fg">{paper.title}</span> and renders it as charts.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="btn btn-primary text-xs disabled:opacity-50"
        >
          {loading ? "Analyzing…" : generated ? "Regenerate" : "Extract figures"}
        </button>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {!generated && !loading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
          Click "Extract figures" to pull charts from this paper.
        </div>
      )}
      {charts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {charts.map((c, i) => (
            <div key={i} className="card space-y-2">
              <div className="text-sm font-medium text-fg">{c.title}</div>
              <p className="text-xs text-muted">{c.explanation}</p>
              {c.sources && (
                <p className="text-[11px] text-muted/70 italic">
                  Source: {c.sources}
                </p>
              )}
              <img
                src={`data:image/png;base64,${c.image_base64}`}
                alt={c.title}
                className="w-full rounded-md border border-border"
              />
              <details className="text-xs">
                <summary className="cursor-pointer text-muted hover:text-fg">view code</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-panel2 p-2 font-mono text-[11px] text-muted">
                  {c.code}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Generate charts ──────────────────────────────────────────────── */
function GenerateCharts({ paper }: { paper: any | null }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ image_base64: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const full = paper
        ? `Based on data from "${paper.title}": ${prompt}`
        : prompt;
      const res = await api.makeGraph(full);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={generate} className="space-y-3">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            paper
              ? `Describe a chart to generate from "${paper.title}" — e.g. "bar chart comparing accuracy across model sizes"`
              : "Describe the chart you want — e.g. 'line chart of accuracy vs. model size for three models'"
          }
          className="input resize-none"
        />
        <div className="flex items-center justify-between">
          {paper && (
            <span className="text-xs text-muted">
              Context: <span className="font-medium text-fg">{paper.title}</span>
            </span>
          )}
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="btn btn-primary ml-auto text-xs disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate chart"}
          </button>
        </div>
      </form>

      {error && <div className="text-sm text-red-400">{error}</div>}

      {result && (
        <div className="card animate-fade-up space-y-3">
          <img
            src={`data:image/png;base64,${result.image_base64}`}
            alt="generated chart"
            className="w-full rounded-md border border-border"
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted hover:text-fg">view code</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-panel2 p-2 font-mono text-[11px] text-muted">
              {result.code}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
