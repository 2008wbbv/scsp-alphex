"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";

const STATUS_OPTIONS = ["unread", "reading", "read", "queued"] as const;
type Status = (typeof STATUS_OPTIONS)[number];

const STATUS_BAR: Record<Status, string> = {
  read:    "bg-emerald-500",
  reading: "bg-indigo-400",
  queued:  "bg-amber-400",
  unread:  "bg-border",
};

const STATUS_LABEL: Record<Status, string> = {
  read:    "text-emerald-400",
  reading: "text-indigo-300",
  queued:  "text-amber-300",
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
            className="line-clamp-3 text-sm font-medium text-white hover:text-accent2 transition-colors"
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
          <select
            value={status}
            onChange={(e) => updateStatus(e.target.value as Status)}
            className={`rounded-full border border-border bg-panel2 px-2.5 py-1 text-[11px] font-medium focus:outline-none transition-colors ${STATUS_LABEL[status]}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="text-white bg-panel2">
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
                className="chip hover:text-white hover:border-border/60"
              >
                source ↗
              </a>
            )}
            <Link
              href={`/papers/${paper.id}`}
              className="chip hover:text-accent2 hover:border-accent/30 hover:bg-accent/10"
            >
              open →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
