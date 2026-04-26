"use client";

import Link from "next/link";
import { useState } from "react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) { setError("Enter a search query first."); return; }
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const { results } = await api.search(q.trim());
      setResults(results ?? []);
    } catch (e: any) {
      setError(e.message ?? "search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-white">Semantic search</h1>
          <p className="text-sm text-muted">
            Searches across every chunk in your library using cosine similarity
            on text-embedding-3-small.
          </p>
        </header>

        <form onSubmit={run} className="flex gap-2">
          <input
            className="input"
            placeholder="e.g. attention mechanisms in long-context models"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </form>

        {error && <div className="text-sm text-red-300">{error}</div>}

        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.chunk_id} className="card">
              <div className="flex items-center justify-between">
                <Link
                  href={`/papers/${r.paper_id}`}
                  className="text-sm font-medium text-white hover:underline"
                >
                  {r.paper?.title ?? "Untitled"}
                </Link>
                <span className="chip">
                  {typeof r.similarity === "number"
                    ? `${(r.similarity * 100).toFixed(0)}% match`
                    : "match"}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {(r.paper?.authors ?? []).slice(0, 3).join(", ")}
                {r.page ? ` · p.${r.page}` : ""}
              </div>
              <p className="mt-2 line-clamp-5 text-sm text-muted/90">
                {r.content}
              </p>
            </div>
          ))}
          {!busy && results.length === 0 && (
            <div className="text-sm text-muted">No results yet.</div>
          )}
        </div>
      </div>
    </Shell>
  );
}
