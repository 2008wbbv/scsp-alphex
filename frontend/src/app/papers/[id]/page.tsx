"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

export default function PaperPage({ params }: { params: { id: string } }) {
  const [paper, setPaper] = useState<any | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<any[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartsError, setChartsError] = useState<string | null>(null);
  const [rechunking, setRechunking] = useState(false);
  const [rechunkMsg, setRechunkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, n] = await Promise.all([
        api.getPaper(params.id),
        api.related(params.id).catch(() => ({ related: [] })),
        api.listNotes(params.id).catch(() => ({ notes: [] })),
      ]);
      setPaper(p ?? null);
      setRelated(r.related ?? []);
      setNotes(n.notes ?? []);
    } catch {
      setPaper(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveNote() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    try {
      await api.createNote({ content, linked_paper_id: params.id });
      load();
    } catch {
      setDraft(content);
    }
  }

  async function rechunk() {
    setRechunking(true);
    setRechunkMsg(null);
    try {
      const { n_chunks } = await api.rechunkPaper(params.id);
      setRechunkMsg(`Indexed ${n_chunks} snippet${n_chunks !== 1 ? "s" : ""}. The assistant can now search this paper.`);
    } catch (err: any) {
      setRechunkMsg(err.message ?? "Re-indexing failed");
    } finally {
      setRechunking(false);
    }
  }

  async function generateCharts() {
    setChartsLoading(true);
    setChartsError(null);
    try {
      const { charts } = await api.chartsFromPaper(params.id);
      setCharts(charts);
    } catch (err: any) {
      setChartsError(err.message ?? "Failed to generate charts");
    } finally {
      setChartsLoading(false);
    }
  }

  function downloadFile(content: string, filename: string, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function exportTex() {
    if (!paper) return;
    setExporting(true);
    try {
      // Build a structured body: abstract → summary → user notes
      const sections: string[] = [];
      if (paper.abstract) {
        sections.push(`## Abstract\n\n${paper.abstract}`);
      }
      if (paper.summary) {
        sections.push(`## Summary\n\n${paper.summary}\n\n[S1]`);
      }
      if (notes.length > 0) {
        const noteText = notes.map((n: any) => n.content).join("\n\n");
        sections.push(`## Notes\n\n${noteText}`);
      }
      if (sections.length === 0) {
        sections.push(`Notes on "${paper.title}".\n\n[S1]`);
      }
      const out = await api.exportLatex({
        title: paper.title,
        body: sections.join("\n\n"),
        paper_ids: [paper.id],
      });
      downloadFile(out.tex, out.filename, "application/x-tex");
      if (out.bib.trim()) downloadFile(out.bib, "references.bib", "text/plain");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="p-6 text-muted">Loading…</div>
      </Shell>
    );
  }

  if (!paper) {
    return (
      <Shell>
        <div className="p-6 text-muted">Paper not found.</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/library" className="text-sm text-muted hover:text-fg">
              ← Library
            </Link>
            <button
              onClick={exportTex}
              disabled={exporting}
              className="flex items-center gap-1.5 chip hover:text-fg hover:border-border/60 disabled:opacity-50"
              title="Export as LaTeX (.tex + references.bib)"
            >
              {exporting ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-muted border-t-fg" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              )}
              {exporting ? "building…" : "Export .tex"}
            </button>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">
              {paper.source_type ?? "paper"}
              {paper.year ? ` · ${paper.year}` : ""}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-fg">
              {paper.title}
            </h1>
            <div className="mt-1 text-sm text-muted">
              {(paper.authors ?? []).join(", ")}
            </div>
          </div>

          {paper.summary && (
            <div className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">
                  AI Summary
                </h2>
                <button
                  onClick={exportTex}
                  disabled={exporting}
                  className="chip hover:text-fg"
                >
                  {exporting ? "exporting…" : "export .tex"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted/90">
                {paper.summary}
              </p>
            </div>
          )}

          {paper.abstract && (
            <div className="card">
              <h2 className="mb-2 text-sm font-semibold text-fg">Abstract</h2>
              <p className="whitespace-pre-wrap text-sm text-muted/90">
                {paper.abstract}
              </p>
            </div>
          )}

          {/* Charts from paper */}
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg">Data Visualizations</h2>
              <button
                onClick={generateCharts}
                disabled={chartsLoading}
                className="chip hover:text-fg disabled:opacity-50"
              >
                {chartsLoading ? "Analyzing paper…" : charts.length > 0 ? "Regenerate" : "Generate charts"}
              </button>
            </div>
            {chartsError && <div className="text-xs text-red-300">{chartsError}</div>}
            {charts.length === 0 && !chartsLoading && !chartsError && (
              <p className="text-xs text-muted">
                Click "Generate charts" to auto-extract quantitative data and visualize it.
              </p>
            )}
            {charts.map((c, i) => (
              <div key={i} className="mb-4 last:mb-0">
                <div className="mb-1 text-sm font-medium text-fg">{c.title}</div>
                <p className="mb-2 text-xs text-muted">{c.explanation}</p>
                <img
                  src={`data:image/png;base64,${c.image_base64}`}
                  alt={c.title}
                  className="w-full rounded-md border border-border"
                />
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted">view code</summary>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-black/40 p-2 font-mono text-[11px] text-muted">
                    {c.code}
                  </pre>
                </details>
              </div>
            ))}
          </div>

          {/* PDF viewer */}
          {paper.pdf_url ? (
            <div className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Read Paper</h2>
                <a
                  href={paper.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="chip hover:text-fg"
                >
                  open in new tab ↗
                </a>
              </div>
              <iframe
                src={paper.pdf_url}
                className="h-[80vh] w-full rounded-md border border-border bg-white"
                title={paper.title}
              />
            </div>
          ) : paper.source_url ? (
            <div className="card">
              <a
                href={paper.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent2"
              >
                View source ↗
              </a>
            </div>
          ) : null}

          <div className="card">
            <h2 className="mb-2 text-sm font-semibold text-fg">Notes</h2>
            <div className="space-y-2">
              {notes.map((n) => (
                <NoteRow key={n.id} note={n} onChange={load} />
              ))}
              {notes.length === 0 && (
                <div className="text-xs text-muted">No notes yet.</div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Jot something down — it'll be linked to this paper."
                className="input"
              />
              <button onClick={saveNote} className="btn btn-primary self-start">
                Save
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="card">
            <h2 className="mb-2 text-sm font-semibold text-fg">Related</h2>
            {related.length === 0 ? (
              <div className="text-xs text-muted">
                Add more papers to see related work.
              </div>
            ) : (
              <ul className="space-y-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/papers/${r.id}`}
                      className="block text-sm text-fg hover:underline"
                    >
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {(r.authors ?? []).slice(0, 2).join(", ")}
                      {typeof r.similarity === "number" &&
                        ` · ${(r.similarity * 100).toFixed(0)}% similar`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link href={`/chat?paper=${paper.id}`} className="btn w-full justify-center">
            Ask the assistant about this paper
          </Link>

          <Link href={`/papers/${paper.id}/annotate`} className="btn w-full justify-center">
            View with AI annotations
          </Link>

          <div className="card space-y-2">
            <div className="text-xs font-medium text-fg">Re-index paper</div>
            <p className="text-xs text-muted">
              If the assistant says it has no context, re-indexing rebuilds the searchable snippets.
            </p>
            <button
              onClick={rechunk}
              disabled={rechunking}
              className="btn w-full py-1.5 text-xs disabled:opacity-50"
            >
              {rechunking ? "Indexing…" : "Re-index snippets"}
            </button>
            {rechunkMsg && (
              <p className="text-xs text-muted">{rechunkMsg}</p>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function NoteRow({ note, onChange }: { note: any; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);

  async function save() {
    try {
      await api.updateNote(note.id, { content: draft });
      setEditing(false);
      onChange();
    } catch {
      // keep edit mode open so the user can retry
    }
  }
  async function del() {
    try {
      await api.deleteNote(note.id);
      onChange();
    } catch {
      // leave note in list; silently fail
    }
  }

  return (
    <div className="rounded-md border border-border bg-panel2 p-2 text-sm">
      {editing ? (
        <>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="input"
          />
          <div className="mt-1 flex gap-1">
            <button onClick={save} className="chip hover:text-fg">
              save
            </button>
            <button onClick={() => setEditing(false)} className="chip">
              cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="whitespace-pre-wrap text-muted/90">{note.content}</div>
          <div className="mt-1 flex gap-1 text-xs">
            <button onClick={() => setEditing(true)} className="chip hover:text-fg">
              edit
            </button>
            <button onClick={del} className="chip hover:border-red-400 hover:text-red-300">
              delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
