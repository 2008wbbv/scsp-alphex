"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setResults([]);
    setSearched(false);
    try {
      const { results } = await api.search(q.trim());
      setResults(results ?? []);
    } catch (e: any) {
      setError(e.message ?? "Search failed");
    } finally {
      setBusy(false);
      setSearched(true);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-white">Semantic search</h1>
          <p className="mt-0.5 text-sm text-muted">
            Searches every passage in your library using cosine similarity on text-embedding-3-small.
          </p>
        </header>

        {/* Search bar */}
        <form onSubmit={run} className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            className="input w-full py-3 pl-10 pr-28 text-base"
            placeholder="e.g. attention mechanisms in long-context models"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            className="btn btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </form>

        {error && <div className="text-sm text-red-300">{error}</div>}

        {/* Results */}
        <div className="space-y-3">
          {results.map((r) => {
            const pct = typeof r.similarity === "number"
              ? Math.round(r.similarity * 100)
              : null;
            return (
              <div
                key={r.chunk_id}
                className="group rounded-lg border border-border bg-panel p-4 transition-all hover:border-border/60 hover:bg-panel/80 animate-fade-up"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/papers/${r.paper_id}`}
                    className="text-sm font-medium text-white group-hover:text-accent2 transition-colors hover:underline"
                  >
                    {r.paper?.title ?? "Untitled"}
                  </Link>
                  {pct !== null && (
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-accent2 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium tabular-nums text-accent2">
                        {pct}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-0.5 text-xs text-muted">
                  {(r.paper?.authors ?? []).slice(0, 3).join(", ")}
                  {r.page ? (
                    <span className="ml-2 rounded bg-panel2 px-1.5 py-0.5 font-mono text-[10px]">
                      p.{r.page}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2.5 line-clamp-4 text-sm leading-relaxed text-muted/80">
                  {r.content}
                </p>
              </div>
            );
          })}

          {!busy && searched && results.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-panel/40 py-12 text-center">
              <Search size={28} className="mx-auto mb-3 text-muted/30" />
              <div className="text-sm font-medium text-white">No results found</div>
              <div className="mt-1 text-xs text-muted">
                Try rephrasing your query or adding more papers to your library
              </div>
            </div>
          )}

          {!busy && !searched && (
            <div className="rounded-lg border border-dashed border-border bg-panel/40 py-12 text-center">
              <Search size={28} className="mx-auto mb-3 text-muted/30" />
              <div className="text-sm text-muted">Enter a query to search your library</div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
