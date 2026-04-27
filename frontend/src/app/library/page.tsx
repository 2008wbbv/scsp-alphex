"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, FolderOpen, Grid3X3, Loader2, Search, X } from "lucide-react";

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

type ViewMode = "grid" | "folders";

export default function LibraryPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // arXiv search
  const [arxivQuery, setArxivQuery] = useState("");
  const [arxivResults, setArxivResults] = useState<any[]>([]);
  const [arxivLoading, setArxivLoading] = useState(false);
  const [arxivError, setArxivError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [showArxiv, setShowArxiv] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of papers) for (const t of p.tags ?? []) set.add(t);
    return [...set].sort();
  }, [papers]);

  const visible = useMemo(() => {
    return papers.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false;
      if (q) {
        const blob = `${p.title} ${(p.authors ?? []).join(" ")} ${(p.tags ?? []).join(" ")}`.toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [papers, filter, tagFilter, q]);

  const stats = useMemo(() => ({
    total: papers.length,
    reading: papers.filter((p) => p.status === "reading").length,
    read: papers.filter((p) => p.status === "read").length,
  }), [papers]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of visible) {
      const key = p.tags?.[0] ?? "Untagged";
      (groups[key] ??= []).push(p);
    }
    return Object.entries(groups).sort(([a], [b]) =>
      a === "Untagged" ? 1 : b === "Untagged" ? -1 : a.localeCompare(b)
    );
  }, [visible]);

  async function searchArxiv() {
    if (!arxivQuery.trim()) return;
    setArxivLoading(true);
    setArxivError(null);
    setArxivResults([]);
    try {
      const { results } = await api.searchArxiv(arxivQuery.trim());
      setArxivResults(results);
    } catch (err: any) {
      setArxivError(err.message ?? "arXiv search failed");
    } finally {
      setArxivLoading(false);
    }
  }

  async function importArxiv(arxivId: string) {
    setImportingId(arxivId);
    try {
      await api.ingestArxiv(arxivId);
      setImportedIds((s) => new Set(s).add(arxivId));
      load();
    } catch (err: any) {
      alert(err.message ?? "Import failed");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-fg">
              your <em className="font-serif italic not-italic text-accent2">library.</em>
            </h1>
            {!loading && papers.length > 0 && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                <span>{stats.total} {stats.total === 1 ? "paper" : "papers"}</span>
                {stats.reading > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
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
          <div className="flex items-center gap-2">
            <input
              className="input max-w-xs"
              placeholder="Filter by title, author, tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="flex gap-0.5 rounded-lg border border-border bg-panel2 p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
                title="Grid view"
                className={`rounded p-1.5 transition-all ${viewMode === "grid" ? "bg-accent/20 text-fg" : "text-muted hover:text-fg"}`}
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => setViewMode("folders")}
                aria-pressed={viewMode === "folders"}
                title="Folder view"
                className={`rounded p-1.5 transition-all ${viewMode === "folders" ? "bg-accent/20 text-fg" : "text-muted hover:text-fg"}`}
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>
        </header>

        <IngestBar onIngested={load} />

        {/* arXiv search toggle */}
        <button
          onClick={() => setShowArxiv((v) => !v)}
          className="flex items-center gap-2 text-xs text-muted hover:text-accent2 transition-colors"
        >
          <Search size={12} />
          {showArxiv ? "Hide arXiv search" : "Search arXiv"} — find and import papers by keyword
        </button>

        {showArxiv && (
          <div className="rounded-xl border border-border bg-panel/50 p-4 space-y-3">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="e.g. retrieval augmented generation transformers"
                value={arxivQuery}
                onChange={(e) => setArxivQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchArxiv()}
              />
              <button
                onClick={searchArxiv}
                disabled={arxivLoading || !arxivQuery.trim()}
                className="btn btn-primary px-4 text-xs disabled:opacity-50"
              >
                {arxivLoading ? <Loader2 size={13} className="animate-spin" /> : "Search"}
              </button>
            </div>
            {arxivError && <p className="text-xs text-red-300">{arxivError}</p>}
            {arxivResults.length > 0 && (
              <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {arxivResults.map((r) => (
                  <li key={r.arxiv_id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-fg leading-snug line-clamp-2">{r.title}</div>
                      <div className="mt-0.5 text-[10px] text-muted">
                        {r.authors?.slice(0, 3).join(", ")}{r.authors?.length > 3 ? " et al." : ""}
                        {r.year ? ` · ${r.year}` : ""}
                      </div>
                      {r.abstract && <p className="mt-1 text-[10px] text-muted/70 line-clamp-2">{r.abstract}</p>}
                    </div>
                    <button
                      onClick={() => importArxiv(r.arxiv_id)}
                      disabled={importingId === r.arxiv_id || importedIds.has(r.arxiv_id)}
                      className="btn shrink-0 text-[10px] py-1 px-2.5 disabled:opacity-60"
                    >
                      {importingId === r.arxiv_id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : importedIds.has(r.arxiv_id) ? "Added ✓" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Status filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`chip transition-all ${
                filter === f
                  ? "border-accent/60 bg-accent/15 text-fg"
                  : "hover:text-fg hover:border-border/60"
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted mr-1">Tags</span>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                aria-pressed={tagFilter === t}
                className={`chip transition-all ${
                  tagFilter === t
                    ? "border-accent2/60 bg-accent2/10 text-accent2"
                    : "hover:text-fg hover:border-border/60"
                }`}
              >
                {t}
                {tagFilter === t && <X size={10} className="ml-1 inline" />}
              </button>
            ))}
          </div>
        )}

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
              <div className="text-sm font-medium text-fg">
                {papers.length === 0 ? "Your library is empty" : "No papers match this filter"}
              </div>
              <div className="mt-1 text-xs text-muted">
                {papers.length === 0
                  ? "Import an arXiv paper, paste a DOI, or upload a PDF above"
                  : "Try a different filter or clear your search"}
              </div>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <PaperCard key={p.id} paper={p} onChange={load} />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([folder, folderPapers]) => (
              <section key={folder}>
                <div className="mb-2 flex items-center gap-2">
                  <FolderOpen size={14} className="text-accent2/70" />
                  <span className="text-xs font-semibold text-fg">{folder}</span>
                  <span className="text-[10px] text-muted">({folderPapers.length})</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {folderPapers.map((p) => (
                    <PaperCard key={p.id} paper={p} onChange={load} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
