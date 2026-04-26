"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import IngestBar from "@/components/IngestBar";
import PaperCard from "@/components/PaperCard";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const FILTERS = ["all", "unread", "reading", "read", "queued"] as const;
type Filter = (typeof FILTERS)[number];

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

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Library</h1>
            <p className="text-sm text-muted">
              {papers.length} {papers.length === 1 ? "paper" : "papers"}
            </p>
          </div>
          <input
            className="input max-w-xs"
            placeholder="Filter by title, author, tag…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </header>

        <IngestBar onIngested={load} />

        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`chip uppercase ${
                filter === f ? "border-accent bg-accent/20 text-white" : "hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loadError && <div className="text-sm text-red-300">{loadError}</div>}
        {loading ? (
          <div className="text-muted">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="card text-center text-muted">
            No papers yet. Upload a PDF or import an arXiv id above to get
            started.
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
