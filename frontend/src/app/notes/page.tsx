"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [paperId, setPaperId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, p] = await Promise.all([api.listNotes(), api.listPapers()]);
      setNotes(n.notes ?? []);
      setPapers(p.papers ?? []);
    } catch {
      // leave existing state; loading clears either way
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
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
    } catch {
      // leave form populated so the user can retry
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
      // silently fail — no loading state to reset
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
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-white">Notes</h1>
          <p className="text-sm text-muted">
            Free-form notes. Link them to a paper to auto-populate citations on
            LaTeX export.
          </p>
        </header>

        <form onSubmit={create} className="card space-y-3">
          <input
            className="input"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            rows={4}
            className="input"
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
        </form>

        {loading ? (
          <div className="text-muted">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="card text-center text-muted">
            No notes yet. Write one above.
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => {
              const linked = papers.find((p) => p.id === n.linked_paper_id);
              return (
                <div key={n.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-white">
                      {n.title || "Untitled note"}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => exportTex(n)}
                        className="chip hover:text-white"
                      >
                        export .tex
                      </button>
                      <button
                        onClick={() => del(n.id)}
                        className="chip hover:border-red-400 hover:text-red-300"
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
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted/90">
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
