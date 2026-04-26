"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlaskConical, Plus, Trash2 } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

export default function ForgePage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPapers, setSelectedPapers] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([api.listPapers(), api.listForgeDrafts()])
      .then(([p, d]) => {
        setPapers(p.papers ?? []);
        setDrafts(d.drafts ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const draft = await api.createForgeDraft({
        title: title.trim() || "Untitled Draft",
        notes: notes.trim(),
        paper_ids: selectedPapers,
      });
      setDrafts((d) => [draft, ...d]);
      setTitle("");
      setNotes("");
      setSelectedPapers([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Delete this draft?")) return;
    try {
      await api.deleteForgeDraft(id);
      setDrafts((d) => d.filter((dr) => dr.id !== id));
    } catch {}
  }

  function togglePaper(id: string) {
    setSelectedPapers((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-fg">Forge</h1>
          <p className="mt-0.5 text-sm text-muted">
            Paste notes and data. Claude builds a structured draft with charts and citations.
          </p>
        </header>

        {/* New draft form */}
        <form onSubmit={generate} className="card space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Draft title</label>
            <input
              className="input"
              placeholder="e.g. Analysis of transformer scaling laws"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Notes and data</label>
            <textarea
              rows={8}
              className="input resize-none"
              placeholder={`Paste your raw notes, data tables, key findings, hypotheses…\n\nExample:\n- GPT-4 accuracy: 94.2% on MMLU\n- Claude 3: 91.8%\n- Gemini Ultra: 90.0%\n- My hypothesis: larger context windows correlate with reasoning gains\n- From Table 3: token efficiency drops 12% after 32k context`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {papers.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">
                Ground in papers (optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {papers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePaper(p.id)}
                    className={`chip transition-all text-xs ${
                      selectedPapers.includes(p.id)
                        ? "border-accent/60 bg-accent/10 text-fg"
                        : "hover:text-fg hover:border-border/60"
                    }`}
                  >
                    {p.title?.slice(0, 40)}{p.title?.length > 40 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={generating || !notes.trim()}
              className="btn btn-primary gap-2 disabled:opacity-50"
            >
              <Plus size={14} />
              {generating ? "Building draft…" : "Generate draft"}
            </button>
          </div>
        </form>

        {/* Draft list */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg border border-border bg-panel animate-pulse" />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
            <div className="flex flex-col items-center gap-2">
              <FlaskConical size={22} className="text-muted/40" />
              No drafts yet — generate your first one above.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted">Your drafts</h2>
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 hover:bg-panel/80 transition-colors"
              >
                <FlaskConical size={14} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <Link href={`/forge/${d.id}`} className="block truncate text-sm font-medium text-fg hover:text-accent2">
                    {d.title}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {new Date(d.updated_at).toLocaleDateString()}
                    {d.share_token && (
                      <span className="ml-2 rounded bg-panel2 px-1 font-mono text-[10px]">shared</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link href={`/forge/${d.id}`} className="chip hover:text-fg hover:border-border/60 text-xs">
                    open →
                  </Link>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    className="chip hover:border-red-400/60 hover:text-red-400 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
