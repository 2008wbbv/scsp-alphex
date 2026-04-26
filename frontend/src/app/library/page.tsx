"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";

import IngestBar from "@/components/IngestBar";
import PaperCard from "@/components/PaperCard";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const FILTERS = ["all", "unread", "reading", "read", "queued"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<string, string> = {
  all: "All",
  unread: "Unread",
  reading: "Reading",
  read: "Read",
  queued: "Queued",
};

export default function LibraryPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { papers } = await api.listPapers();
      setPapers(papers ?? []);
    } catch (err: any) {
      setLoadError(err.message ?? "Failed to load papers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    return (papers ?? []).filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (q) {
        const blob = `${p.title} ${(p.authors ?? []).join(" ")} ${(p.tags ?? [])
          .join(" ")}`.toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [papers, filter, q]);

  const stats = useMemo(() => ({
    total: papers.length,
    reading: papers.filter((p) => p.status === "reading").length,
    read: papers.filter((p) => p.status === "read").length,
  }), [papers]);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#0b0b0e]">Library</h1>
            {!loading && papers.length > 0 && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                <span>{stats.total} {stats.total === 1 ? "paper" : "papers"}</span>
                {stats.reading > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0b0b0e]" />
                    {stats.reading} reading
                  </span>
                )}
                {stats.read > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {stats.read} read
                  </span>
                )}
              </div>
            )}
          </div>
          <input
            className="input max-w-xs"
            placeholder="Filter by title, author, tag…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </header>

        <IngestBar onIngested={load} />

        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`chip transition-all ${
                filter === f
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "hover:text-[#0b0b0e] hover:border-border/60"
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>

        {loadError && <div className="text-sm text-red-300">{loadError}</div>}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 rounded-lg border border-border bg-panel animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-panel/40 py-16 text-center">
            <BookOpen size={32} className="text-muted/40" />
            <div>
              <div className="text-sm font-medium text-[#0b0b0e]">
                {papers.length === 0 ? "Your library is empty" : "No papers match this filter"}
              </div>
              <div className="mt-1 text-xs text-muted">
                {papers.length === 0
                  ? "Import an arXiv paper, paste a DOI, or upload a PDF above"
                  : "Try a different filter or clear your search"}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <PaperCard key={p.id} paper={p} onChange={load} />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
