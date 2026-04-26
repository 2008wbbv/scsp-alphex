"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [paperId, setPaperId] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [n, p] = await Promise.all([api.listNotes(), api.listPapers()]);
      setNotes(n.notes ?? []);
      setPapers(p.papers ?? []);
    } catch (err: any) {
      setLoadError(err.message ?? "Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!content.trim()) { setSaveError("Note content is required."); return; }
    try {
      await api.createNote({
        title: title.trim() || undefined,
        content: content.trim(),
        linked_paper_id: paperId || undefined,
      });
      setTitle("");
      setContent("");
      setPaperId("");
      load();
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to save note.");
    }
  }

  async function exportTex(note: any) {
    try {
      const out = await api.exportLatex({
        title: note.title || "Research note",
        body: note.content,
        paper_ids: note.linked_paper_id ? [note.linked_paper_id] : [],
        note_id: note.id,
      });
      const blob = new Blob([out.tex], { type: "application/x-tex" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      // silently fail
    }
  }

  async function del(id: string) {
    try {
      await api.deleteNote(id);
      load();
    } catch {
      // leave note in list; silently fail
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-fg">
            Notes
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Free-form notes. Link to a paper for auto-populated citations on LaTeX export.
          </p>
        </header>

        {/* Create form */}
        <form onSubmit={create} className="rounded-lg border border-border bg-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-wide">
            <Plus size={12} />
            New note
          </div>
          <input
            className="input"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            rows={4}
            className="input resize-none"
            placeholder="Write your note. Use [S1] to cite the linked paper."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <select
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
              className="input max-w-xs"
            >
              <option value="">No linked paper</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button className="btn btn-primary ml-auto">Save note</button>
          </div>
          {saveError && <div className="text-xs text-red-300">{saveError}</div>}
        </form>

        {/* Notes list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg border border-border bg-panel animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="text-sm text-red-300">{loadError}</div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel/40 py-14 text-center">
            <FileText size={28} className="text-muted/30" />
            <div>
              <div className="text-sm font-medium text-fg">No notes yet</div>
              <div className="mt-0.5 text-xs text-muted">Write your first note above</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => {
              const linked = papers.find((p) => p.id === n.linked_paper_id);
              return (
                <div key={n.id} className="group rounded-lg border border-border bg-panel p-4 transition-all hover:border-border/60 animate-fade-up">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-fg">
                      {n.title || "Untitled note"}
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => exportTex(n)}
                        className="chip hover:text-fg hover:border-border/60"
                      >
                        .tex
                      </button>
                      <button
                        onClick={() => del(n.id)}
                        className="chip hover:border-red-400/60 hover:text-red-300 hover:bg-red-500/10"
                      >
                        delete
                      </button>
                    </div>
                  </div>
                  {linked && (
                    <Link
                      href={`/papers/${linked.id}`}
                      className="mt-1 inline-block text-xs text-accent2 hover:underline"
                    >
                      → {linked.title}
                    </Link>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted/80">
                    {n.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
