"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Lightbulb, Search, BookOpen, ListChecks, Loader2 } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

type Result = {
  questions: string[];
  gaps: string[];
  hypotheses: string[];
  procedure: string[];
};

const SECTION_ICONS = {
  questions: Search,
  gaps: BookOpen,
  hypotheses: Lightbulb,
  procedure: ListChecks,
};

const SECTION_LABELS: Record<keyof Result, string> = {
  questions: "Research Questions",
  gaps: "Knowledge Gaps",
  hypotheses: "Testable Hypotheses",
  procedure: "Proposed Procedure",
};

const SECTION_COLORS: Record<keyof Result, string> = {
  questions: "border-accent/40 bg-accent/5",
  gaps: "border-amber-500/30 bg-amber-500/5",
  hypotheses: "border-emerald-500/30 bg-emerald-500/5",
  procedure: "border-indigo-500/30 bg-indigo-500/5",
};

const SECTION_DOT: Record<keyof Result, string> = {
  questions: "bg-accent",
  gaps: "bg-amber-400",
  hypotheses: "bg-emerald-400",
  procedure: "bg-indigo-400",
};

export default function ResearchPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topics, setTopics] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [papersLoading, setPapersLoading] = useState(true);

  useEffect(() => {
    api.listPapers()
      .then(({ papers }) => setPapers(papers))
      .catch(() => {})
      .finally(() => setPapersLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function generate() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateResearchQuestions([...selected], topics);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Failed to generate questions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <FlaskConical size={20} className="text-accent" />
            Research Question Generator
          </h1>
          <p className="mt-1 text-sm text-muted">
            Select papers from your library, optionally add topic keywords, and let Claude generate research questions, gaps, hypotheses, and a methodology.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Left: paper selection + topic */}
          <div className="space-y-4">
            <div className="card">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                Select papers ({selected.size} selected)
              </h2>
              {papersLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-border" />
                  ))}
                </div>
              ) : papers.length === 0 ? (
                <p className="text-xs text-muted">No papers in your library yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {papers.map((p) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors ${
                        selected.has(p.id)
                          ? "bg-accent/10 text-fg"
                          : "text-muted hover:bg-panel2 hover:text-fg"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 accent-accent"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span className="text-xs leading-snug line-clamp-2">
                        {p.title || "Untitled"}
                        {p.year ? (
                          <span className="ml-1 text-muted/60">· {p.year}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2 border-t border-border pt-2">
                <button
                  onClick={() => setSelected(new Set(papers.map((p) => p.id)))}
                  className="text-[11px] text-muted hover:text-fg"
                >
                  all
                </button>
                <span className="text-muted/30">·</span>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-[11px] text-muted hover:text-fg"
                >
                  none
                </button>
              </div>
            </div>

            <div className="card">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted">
                Topics / Focus (optional)
              </label>
              <textarea
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                rows={3}
                placeholder="e.g. transformer efficiency, few-shot learning, biomedical NLP"
                className="w-full resize-none rounded-md border border-border bg-panel2 px-3 py-2 text-xs text-fg placeholder-muted/50 focus:border-border/60 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted">
                Leave blank to let Claude infer from selected papers.
              </p>
            </div>

            <button
              onClick={generate}
              disabled={loading || selected.size === 0}
              className="btn btn-primary w-full gap-2 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <FlaskConical size={14} />
                  Generate
                </>
              )}
            </button>

            {error && (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>

          {/* Right: results */}
          <div>
            {!result && !loading && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                <FlaskConical size={32} className="mb-3 text-muted/30" />
                <p className="text-sm text-muted">
                  Select papers and click Generate
                </p>
                <p className="mt-1 text-xs text-muted/60">
                  Claude will analyse your library and produce actionable research output.
                </p>
              </div>
            )}
            {loading && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-accent/60" />
                <p className="text-sm text-muted">Claude is analysing your papers…</p>
              </div>
            )}
            {result && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(Object.keys(SECTION_LABELS) as (keyof Result)[]).map((key) => {
                  const Icon = SECTION_ICONS[key];
                  const items = result[key];
                  return (
                    <div
                      key={key}
                      className={`rounded-lg border p-4 ${SECTION_COLORS[key]}`}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <Icon size={14} className="shrink-0 text-fg/60" />
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-fg/70">
                          {SECTION_LABELS[key]}
                        </h3>
                        <span className="ml-auto rounded-full bg-border px-1.5 py-0.5 text-[10px] text-muted">
                          {items.length}
                        </span>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-xs text-muted">None generated.</p>
                      ) : (
                        <ol className="space-y-2.5">
                          {items.map((item, i) => (
                            <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-fg/80">
                              <span
                                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SECTION_DOT[key]}`}
                              />
                              <span>
                                {key === "procedure" && (
                                  <span className="mr-1 font-mono text-[10px] text-muted">
                                    {i + 1}.
                                  </span>
                                )}
                                {item}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
