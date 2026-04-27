"use client";

import { useEffect, useRef, useState } from "react";
import { BookText, Check, Copy, Loader2, FileCode } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

type Paper = { id: string; title: string; year: number | null; authors: string[] | null };
type Result = { text: string; papers: Paper[] };

// Render markdown-ish review text: ## headings, [Sn] citation chips, paragraphs.
function ReviewBody({ text, papers }: { text: string; papers: Paper[] }) {
  const titleMap = Object.fromEntries(papers.map((p, i) => [`S${i + 1}`, p]));

  function renderLine(line: string, key: number) {
    // Split on citation groups like [S1], [S2, S3]
    const parts = line.split(/(\[S[\d,\s]+\])/g);
    return (
      <span key={key}>
        {parts.map((part, j) => {
          const m = part.match(/^\[([^\]]+)\]$/);
          if (m) {
            const keys = m[1].split(/,\s*/).map((k) => k.trim());
            return (
              <span key={j} className="inline-flex flex-wrap gap-0.5">
                {keys.map((k) => {
                  const paper = titleMap[k];
                  return (
                    <span
                      key={k}
                      title={paper ? `${paper.title}${paper.year ? ` (${paper.year})` : ""}` : k}
                      className="cursor-help rounded bg-accent/15 px-1 py-0.5 text-[10px] font-mono text-accent hover:bg-accent/25 transition-colors"
                    >
                      {part.includes(",") ? `[${k}]` : part}
                    </span>
                  );
                })}
              </span>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </span>
    );
  }

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let para: string[] = [];

  function flushPara() {
    if (!para.length) return;
    elements.push(
      <p key={elements.length} className="text-sm leading-relaxed text-fg/85">
        {renderLine(para.join(" "), 0)}
      </p>
    );
    para = [];
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushPara();
      elements.push(
        <h2 key={elements.length} className="mt-6 mb-2 text-base font-semibold text-fg first:mt-0">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushPara();
      elements.push(
        <h3 key={elements.length} className="mt-4 mb-1 text-sm font-semibold text-fg">
          {line.slice(4)}
        </h3>
      );
    } else if (line.trim() === "") {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushPara();

  return <div className="space-y-3">{elements}</div>;
}

export default function LitReviewPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [papersLoading, setPapersLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedForge, setSavedForge] = useState(false);

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
      const res = await api.generateLitReview([...selected], focus);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Failed to generate review");
    } finally {
      setLoading(false);
    }
  }

  async function copyText() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function exportLatex() {
    if (!result) return;
    setExporting(true);
    try {
      const paperIds = result.papers.map((p) => p.id);
      const out = await api.exportLatex({
        title: focus.trim() || "Literature Review",
        body: result.text,
        paper_ids: paperIds,
      });
      const dl = (content: string, name: string, mime: string) => {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      };
      dl(out.tex, out.filename, "application/x-tex");
      if (out.bib.trim()) dl(out.bib, "references.bib", "text/plain");
    } catch {
      // leave result visible
    } finally {
      setExporting(false);
    }
  }

  async function saveToForge() {
    if (!result) return;
    try {
      await api.createForgeDraft({
        title: focus.trim() || "Literature Review",
        notes: result.text,
        paper_ids: result.papers.map((p) => p.id),
      });
      setSavedForge(true);
      setTimeout(() => setSavedForge(false), 2500);
    } catch {
      // silent
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <BookText size={20} className="text-accent" />
            Literature Review
          </h1>
          <p className="mt-1 text-sm text-muted">
            Select papers, optionally set a focus, and Claude will synthesise them into a citation-grounded academic literature review.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Left: controls */}
          <div className="space-y-4">
            <div className="card">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                Papers ({selected.size} selected)
              </h2>
              {papersLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-border" />
                  ))}
                </div>
              ) : papers.length === 0 ? (
                <p className="text-xs text-muted">No papers in your library yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
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
                        {p.year ? <span className="ml-1 text-muted/60">· {p.year}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2 border-t border-border pt-2 text-[11px]">
                <button onClick={() => setSelected(new Set(papers.map((p) => p.id)))} className="text-muted hover:text-fg">all</button>
                <span className="text-muted/30">·</span>
                <button onClick={() => setSelected(new Set())} className="text-muted hover:text-fg">none</button>
              </div>
            </div>

            <div className="card">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted">
                Focus / Scope (optional)
              </label>
              <textarea
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                rows={3}
                placeholder="e.g. attention mechanisms in vision transformers, or leave blank for a general review"
                className="w-full resize-none rounded-md border border-border bg-panel2 px-3 py-2 text-xs text-fg placeholder-muted/50 focus:border-border/60 focus:outline-none"
              />
            </div>

            <button
              onClick={generate}
              disabled={loading || selected.size === 0}
              className="btn btn-primary w-full gap-2 disabled:opacity-40"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" />Generating…</>
              ) : (
                <><BookText size={14} />Generate Review</>
              )}
            </button>

            {error && (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>

          {/* Right: output */}
          <div className="space-y-4">
            {!result && !loading && (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                <BookText size={32} className="mb-3 text-muted/30" />
                <p className="text-sm text-muted">Select papers and click Generate</p>
                <p className="mt-1 text-xs text-muted/60 max-w-xs">
                  Claude will group them into themes, synthesise findings, and produce a citation-grounded review.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-accent/60" />
                <p className="text-sm text-muted">Claude is reading and synthesising your papers…</p>
                <p className="text-xs text-muted/60">This usually takes 15–30 seconds.</p>
              </div>
            )}

            {result && (
              <>
                {/* Action bar */}
                <div className="flex items-center gap-2">
                  <button onClick={copyText} className="chip hover:text-fg hover:border-border/60 gap-1.5">
                    {copied ? <><Check size={11} />Copied</> : <><Copy size={11} />Copy</>}
                  </button>
                  <button
                    onClick={exportLatex}
                    disabled={exporting}
                    className="chip hover:text-fg hover:border-border/60 gap-1.5 disabled:opacity-50"
                  >
                    <FileCode size={11} />
                    {exporting ? "Building…" : "Export .tex"}
                  </button>
                  <button onClick={saveToForge} className="chip hover:text-fg hover:border-border/60 gap-1.5">
                    {savedForge ? <><Check size={11} />Saved</> : "Save to Forge"}
                  </button>
                  <span className="ml-auto text-xs text-muted">
                    {result.papers.length} paper{result.papers.length !== 1 ? "s" : ""} synthesised
                  </span>
                </div>

                {/* Review text */}
                <div className="card">
                  <ReviewBody text={result.text} papers={result.papers} />
                </div>

                {/* Bibliography */}
                <div className="card">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                    Sources
                  </h2>
                  <ol className="space-y-2">
                    {result.papers.map((p, i) => (
                      <li key={p.id} className="flex gap-2.5 text-xs text-muted">
                        <span className="shrink-0 font-mono text-[10px] text-accent/70 mt-0.5">
                          [S{i + 1}]
                        </span>
                        <span>
                          <span className="text-fg/80">{p.title}</span>
                          {p.authors?.length ? (
                            <span className="ml-1 text-muted/60">
                              · {p.authors.slice(0, 3).join(", ")}
                              {p.authors.length > 3 ? " et al." : ""}
                            </span>
                          ) : null}
                          {p.year ? <span className="ml-1 text-muted/60">· {p.year}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
