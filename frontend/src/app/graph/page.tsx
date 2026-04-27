"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, Download, Image, Network, X } from "lucide-react";

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
          <div className="relative flex-1 max-w-sm">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full appearance-none rounded-md border border-border bg-panel pl-2.5 pr-7 py-1.5 text-xs text-fg focus:outline-none focus:border-fg/40"
            >
              <option value="">All papers (similarity graph)</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 8 8">
              <path d="M1 2.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
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
        className="relative h-[520px] w-full overflow-hidden rounded-xl border border-border bg-[#f6f5f3]"
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
            nodeVal={(n: any) => n.val}
            linkWidth={(l: any) => Math.max(0.5, (l.value ?? 0.3) * 2.5)}
            linkColor={() => "rgba(99,102,241,0.18)"}
            backgroundColor="transparent"
            onNodeClick={(node: any) => setSelected(node)}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, gs: number) => {
              const x = node.x as number;
              const y = node.y as number;
              if (!isFinite(x) || !isFinite(y)) return;
              const r = 5 / gs;

              // Outer glow
              const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
              glow.addColorStop(0, "rgba(99,102,241,0.18)");
              glow.addColorStop(1, "rgba(99,102,241,0)");
              ctx.beginPath();
              ctx.arc(x, y, r * 2.2, 0, 2 * Math.PI);
              ctx.fillStyle = glow;
              ctx.fill();

              // Node fill with gradient
              const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
              grad.addColorStop(0, node === selected ? "#818cf8" : "#6366f1");
              grad.addColorStop(1, node === selected ? "#4f46e5" : "#4338ca");
              ctx.beginPath();
              ctx.arc(x, y, r, 0, 2 * Math.PI);
              ctx.fillStyle = grad;
              ctx.fill();

              // Subtle border
              ctx.strokeStyle = "rgba(255,255,255,0.35)";
              ctx.lineWidth = 0.8 / gs;
              ctx.stroke();

              // Label
              if (gs < 0.6) return;
              const label = node.title?.length > 26 ? node.title.slice(0, 26) + "…" : node.title;
              ctx.font = `${9 / gs}px Inter, sans-serif`;
              ctx.fillStyle = "rgba(30,27,75,0.75)";
              ctx.textAlign = "center";
              ctx.fillText(label, x, y + r + 9 / gs);
            }}
          />
        )}
      </div>
      {selected && (
        <div className="animate-fade-up rounded-xl border border-border bg-panel p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">{selected.title}</div>
            <div className="mt-0.5 text-xs text-muted">
              {(selected.authors ?? []).slice(0, 2).join(", ")}{selected.year ? ` · ${selected.year}` : ""}
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
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-fg">{c.title}</div>
                <a
                  href={`data:image/png;base64,${c.image_base64}`}
                  download={`${(c.title || "chart").replace(/\s+/g, "-")}.png`}
                  className="chip hover:text-fg hover:border-border/60 flex shrink-0 items-center gap-1 text-[10px]"
                  title="Download PNG"
                >
                  <Download size={10} />
                  PNG
                </a>
              </div>
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
          <div className="flex justify-end">
            <a
              href={`data:image/png;base64,${result.image_base64}`}
              download="chart.png"
              className="chip hover:text-fg hover:border-border/60 flex items-center gap-1 text-[10px]"
            >
              <Download size={10} />
              Download PNG
            </a>
          </div>
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
