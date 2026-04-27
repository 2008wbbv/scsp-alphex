"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Columns2, Loader2, ArrowRight } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

type Aspect = {
  label: string;
  paper1: string;
  paper2: string;
  insight: string;
};

type CompareResult = {
  aspects: Aspect[];
  paper1: { id: string; title: string };
  paper2: { id: string; title: string };
};

const ASPECT_ICONS: Record<string, string> = {
  "Research Question": "❓",
  "Methodology": "🔬",
  "Dataset / Evaluation": "📊",
  "Key Results": "🏆",
  "Limitations": "⚠️",
  "Overall Contribution": "✨",
};

export default function ComparePage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [papersLoading, setPapersLoading] = useState(true);
  const [paperId1, setPaperId1] = useState("");
  const [paperId2, setPaperId2] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPapers()
      .then(({ papers }) => setPapers(papers))
      .catch(() => {})
      .finally(() => setPapersLoading(false));
  }, []);

  async function compare() {
    if (!paperId1 || !paperId2 || paperId1 === paperId2) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.comparePapers(paperId1, paperId2);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Comparison failed");
    } finally {
      setLoading(false);
    }
  }

  const canCompare = paperId1 && paperId2 && paperId1 !== paperId2 && !loading;

  return (
    <Shell>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <Columns2 size={20} className="text-accent" />
            Side-by-Side Comparison
          </h1>
          <p className="mt-1 text-sm text-muted">
            Select two papers and Claude will compare them across methodology, results, limitations, and more.
          </p>
        </div>

        {/* Paper selectors */}
        <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="card">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted">
              Paper 1
            </label>
            {papersLoading ? (
              <div className="h-8 animate-pulse rounded bg-border" />
            ) : (
              <select
                value={paperId1}
                onChange={(e) => setPaperId1(e.target.value)}
                className="input text-sm"
              >
                <option value="">Select a paper…</option>
                {papers.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.id === paperId2}>
                    {p.title || "Untitled"}{p.year ? ` (${p.year})` : ""}
                  </option>
                ))}
              </select>
            )}
            {paperId1 && (
              <Link
                href={`/papers/${paperId1}`}
                className="mt-1 inline-block text-[11px] text-muted hover:text-accent transition-colors"
              >
                open →
              </Link>
            )}
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight size={16} className="text-muted/40" />
          </div>

          <div className="card">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted">
              Paper 2
            </label>
            {papersLoading ? (
              <div className="h-8 animate-pulse rounded bg-border" />
            ) : (
              <select
                value={paperId2}
                onChange={(e) => setPaperId2(e.target.value)}
                className="input text-sm"
              >
                <option value="">Select a paper…</option>
                {papers.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.id === paperId1}>
                    {p.title || "Untitled"}{p.year ? ` (${p.year})` : ""}
                  </option>
                ))}
              </select>
            )}
            {paperId2 && (
              <Link
                href={`/papers/${paperId2}`}
                className="mt-1 inline-block text-[11px] text-muted hover:text-accent transition-colors"
              >
                open →
              </Link>
            )}
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={compare}
            disabled={!canCompare}
            className="btn btn-primary gap-2 disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Comparing…
              </>
            ) : (
              <>
                <Columns2 size={14} />
                Compare papers
              </>
            )}
          </button>
          {paperId1 === paperId2 && paperId1 && (
            <p className="text-xs text-muted">Select two different papers.</p>
          )}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Results */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={28} className="animate-spin text-accent/60" />
            <p className="text-sm text-muted">Claude is reading both papers…</p>
          </div>
        )}

        {result && (
          <div className="space-y-0 overflow-hidden rounded-lg border border-border">
            {/* Header row */}
            <div className="grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] bg-panel2 text-xs font-semibold uppercase tracking-widest text-muted">
              <div className="border-r border-border px-4 py-3">Aspect</div>
              <div className="border-r border-border px-4 py-3 line-clamp-1" title={result.paper1.title}>
                <Link href={`/papers/${result.paper1.id}`} className="hover:text-fg transition-colors">
                  {result.paper1.title}
                </Link>
              </div>
              <div className="px-4 py-3 line-clamp-1" title={result.paper2.title}>
                <Link href={`/papers/${result.paper2.id}`} className="hover:text-fg transition-colors">
                  {result.paper2.title}
                </Link>
              </div>
            </div>

            {result.aspects.map((aspect, i) => (
              <div
                key={i}
                className="grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] border-t border-border bg-panel"
              >
                <div className="border-r border-border px-4 py-4">
                  <div className="text-xs font-semibold text-fg">
                    {ASPECT_ICONS[aspect.label] || "·"} {aspect.label}
                  </div>
                  {aspect.insight && (
                    <div className="mt-2 rounded-md bg-accent/8 px-2 py-1.5 text-[10px] leading-relaxed text-muted/80 italic">
                      {aspect.insight}
                    </div>
                  )}
                </div>
                <div className="border-r border-border px-4 py-4 text-xs leading-relaxed text-fg/80">
                  {aspect.paper1 || <span className="text-muted">—</span>}
                </div>
                <div className="px-4 py-4 text-xs leading-relaxed text-fg/80">
                  {aspect.paper2 || <span className="text-muted">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
            <Columns2 size={32} className="mb-3 text-muted/30" />
            <p className="text-sm text-muted">Select two papers and click Compare</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
