"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";

const STATUS_OPTIONS = ["unread", "reading", "read", "queued"];

export default function PaperCard({
  paper,
  onChange,
}: {
  paper: any;
  onChange: () => void;
}) {
  const [status, setStatus] = useState(paper.status ?? "unread");
  const [tagDraft, setTagDraft] = useState("");

  async function updateStatus(s: string) {
    setStatus(s);
    await api.updatePaper(paper.id, { status: s });
    onChange();
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const v = tagDraft.trim();
    if (!v) return;
    setTagDraft("");
    await api.addTag(paper.id, v);
    onChange();
  }

  async function removeTag(name: string) {
    await api.removeTag(paper.id, name);
    onChange();
  }

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/papers/${paper.id}`}
          className="line-clamp-3 text-sm font-medium text-white hover:underline"
        >
          {paper.title || "Untitled"}
        </Link>
        <span className="chip uppercase">{paper.source_type ?? "upload"}</span>
      </div>
      <div className="mt-1 line-clamp-1 text-xs text-muted">
        {(paper.authors ?? []).slice(0, 4).join(", ")}
        {paper.year ? ` · ${paper.year}` : ""}
      </div>

      {paper.summary && (
        <p className="mt-3 line-clamp-4 text-xs text-muted/90">{paper.summary}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {(paper.tags ?? []).map((t: string) => (
          <button
            key={t}
            onClick={() => removeTag(t)}
            className="chip hover:border-red-400 hover:text-red-300"
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
            className="w-20 rounded-full border border-border bg-panel2 px-2 py-0.5 text-xs text-white placeholder-muted focus:border-accent focus:outline-none"
          />
        </form>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <select
          value={status}
          onChange={(e) => updateStatus(e.target.value)}
          className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-white"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {paper.source_url && (
            <a
              href={paper.source_url}
              target="_blank"
              rel="noreferrer"
              className="chip hover:text-white"
            >
              source
            </a>
          )}
          <Link href={`/papers/${paper.id}`} className="chip hover:text-white">
            open →
          </Link>
        </div>
      </div>
    </div>
  );
}
