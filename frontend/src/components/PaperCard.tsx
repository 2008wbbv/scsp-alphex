"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";

const STATUS_OPTIONS = ["unread", "reading", "read", "queued"] as const;
type Status = (typeof STATUS_OPTIONS)[number];

const STATUS_BAR: Record<Status, string> = {
  read:    "bg-fg",
  reading: "bg-fg",
  queued:  "bg-fg",
  unread:  "bg-border",
};

const STATUS_LABEL: Record<Status, string> = {
  read:    "text-fg",
  reading: "text-fg",
  queued:  "text-fg",
  unread:  "text-muted",
};

export default function PaperCard({
  paper,
  onChange,
}: {
  paper: any;
  onChange: () => void;
}) {
  const [status, setStatus] = useState<Status>((paper.status as Status) ?? "unread");
  const [tagDraft, setTagDraft] = useState("");
  const [exporting, setExporting] = useState(false);

  async function updateStatus(s: Status) {
    const prev = status;
    setStatus(s);
    try {
      await api.updatePaper(paper.id, { status: s });
      onChange();
    } catch {
      setStatus(prev);
    }
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const v = tagDraft.trim();
    if (!v) return;
    setTagDraft("");
    try {
      await api.addTag(paper.id, v);
      onChange();
    } catch {
      setTagDraft(v);
    }
  }

  async function deletePaper() {
    if (!confirm(`Delete "${paper.title}"? This cannot be undone.`)) return;
    try {
      await api.deletePaper(paper.id);
      onChange();
    } catch {
      // leave card in place
    }
  }

  async function exportTex() {
    setExporting(true);
    try {
      const body =
        paper.summary ? `## Summary\n\n${paper.summary}\n\n[S1]`
        : paper.abstract ? `## Abstract\n\n${paper.abstract}\n\n[S1]`
        : `Paper: ${paper.title}\n\n[S1]`;
      const out = await api.exportLatex({ title: paper.title, body, paper_ids: [paper.id] });
      const dl = (content: string, name: string, mime: string) => {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      };
      dl(out.tex, out.filename, "application/x-tex");
      if (out.bib.trim()) dl(out.bib, "references.bib", "text/plain");
    } catch {
      // ignore — paper is still usable
    } finally {
      setExporting(false);
    }
  }

  async function removeTag(name: string) {
    try {
      await api.removeTag(paper.id, name);
      onChange();
    } catch {
      // no-op: card retains current state
    }
  }

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-panel transition-all hover:border-border/80 hover:bg-panel/80 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-px">
      {/* Status accent bar */}
      <div className={`h-[3px] w-full ${STATUS_BAR[status]} transition-colors`} />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/papers/${paper.id}`}
            className="line-clamp-3 text-sm font-medium text-fg hover:text-accent2 transition-colors"
          >
            {paper.title || "Untitled"}
          </Link>
          <span className="chip shrink-0 uppercase tracking-wider text-[10px]">
            {paper.source_type ?? "upload"}
          </span>
        </div>

        <div className="mt-1 line-clamp-1 text-xs text-muted">
          {(paper.authors ?? []).slice(0, 3).join(", ")}
          {paper.year ? (
            <span className="ml-1 text-muted/60">· {paper.year}</span>
          ) : null}
        </div>

        {paper.summary && (
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted/80">
            {paper.summary}
          </p>
        )}

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1">
          {(paper.tags ?? []).map((t: string) => (
            <button
              key={t}
              onClick={() => removeTag(t)}
              className="chip hover:border-red-400/60 hover:text-red-300 hover:bg-red-500/10"
              title="Click to remove"
            >
              #{t}
            </button>
          ))}
          <form onSubmit={addTag} className="flex">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="+ tag"
              className="w-16 rounded-full border border-transparent bg-transparent px-2 py-0.5 text-xs text-muted placeholder-muted/50 focus:border-border focus:bg-panel2 focus:outline-none transition-all"
            />
          </form>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="relative">
            <select
              value={status}
              onChange={(e) => updateStatus(e.target.value as Status)}
              className={`appearance-none rounded-full border border-border bg-panel2 pl-2.5 pr-6 py-1 text-[11px] font-medium focus:outline-none transition-colors focus:ring-0 ${STATUS_LABEL[status]}`}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4l4 4 4-4" />
            </svg>
          </div>
          <div className="flex gap-1">
            {paper.source_url && (
              <a
                href={paper.source_url}
                target="_blank"
                rel="noreferrer"
                className="chip hover:text-fg hover:border-border/60"
              >
                source ↗
              </a>
            )}
            <button
              onClick={exportTex}
              disabled={exporting}
              className="chip hover:text-fg hover:border-border/60 disabled:opacity-50"
              title="Export as LaTeX"
            >
              {exporting ? "…" : ".tex"}
            </button>
            <Link href={`/papers/${paper.id}`} className="chip hover:text-fg hover:border-border/60">
              open →
            </Link>
            <button
              onClick={deletePaper}
              className="chip hover:border-red-400/60 hover:text-red-400 hover:bg-red-50"
              title="Delete paper"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
