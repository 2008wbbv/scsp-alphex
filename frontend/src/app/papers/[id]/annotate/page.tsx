"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

type Term = { term: string; definition: string };
type Chunk = { content: string; page: number | null; chunk_index: number };

type Segment = { text: string; term?: Term };

function segmentText(text: string, terms: Term[]): Segment[] {
  if (!terms.length) return [{ text }];
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const escaped = sorted.map((t) =>
    t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => {
      const match = sorted.find(
        (t) => t.term.toLowerCase() === part.toLowerCase()
      );
      return match ? { text: part, term: match } : { text: part };
    });
}

function AnnotatedChunk({ chunk, terms }: { chunk: Chunk; terms: Term[] }) {
  const segments = segmentText(chunk.content, terms);

  return (
    <div className="group relative">
      {chunk.page != null && (
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted/60">
          p.{chunk.page}
        </span>
      )}
      <p className="text-sm leading-[1.85] text-fg/90">
        {segments.map((seg, i) =>
          seg.term ? (
            <Tooltip key={i} term={seg.term}>
              <span className="relative cursor-help border-b border-dashed border-fg/40 text-fg transition-colors hover:border-fg hover:text-fg">
                {seg.text}
              </span>
            </Tooltip>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
    </div>
  );
}

function Tooltip({ term, children }: { term: Term; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<"above" | "below">("above");
  const ref = useRef<HTMLSpanElement>(null);

  function handleEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos(rect.top > 120 ? "above" : "below");
    }
    setVisible(true);
  }

  return (
    <span
      ref={ref}
      className="relative inline"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setVisible(false)}
      onFocus={handleEnter}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className={`pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg border border-border bg-panel px-3 py-2 shadow-lg ${
            pos === "above" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          }`}
        >
          <span className="block text-[11px] font-semibold text-fg">
            {term.term}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
            {term.definition}
          </span>
        </span>
      )}
    </span>
  );
}

export default function AnnotatePage({ params }: { params: { id: string } }) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [paper, ann] = await Promise.all([
        api.getPaper(params.id),
        api.getAnnotations(params.id),
      ]);
      setPaperTitle(paper?.title ?? "");
      setChunks(ann.chunks);
      setTerms(ann.terms);
    } catch (e: any) {
      setError(e.message ?? "Failed to load annotations");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <Link href={`/papers/${params.id}`} className="text-sm text-muted hover:text-fg">
            ← Back
          </Link>
          {paperTitle && (
            <span className="truncate text-sm font-medium text-fg">{paperTitle}</span>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* Main reader */}
          <div>
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-border" />
                    <div className="h-3 w-[90%] animate-pulse rounded bg-border" />
                    <div className="h-3 w-[80%] animate-pulse rounded bg-border" />
                  </div>
                ))}
                <p className="mt-4 text-xs text-muted">
                  Claude is reading the paper and identifying terms…
                </p>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-border bg-panel p-6 text-center">
                <BookOpen size={28} className="mx-auto mb-3 text-muted/30" />
                <p className="text-sm text-red-400">{error}</p>
                {error.includes("Re-index") && (
                  <Link
                    href={`/papers/${params.id}`}
                    className="mt-3 inline-block text-xs text-muted underline"
                  >
                    Go back and click "Re-index snippets" first
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-lg border border-border bg-panel/60 px-4 py-2.5 text-xs text-muted">
                  Hover over{" "}
                  <span className="border-b border-dashed border-fg/40 text-fg">
                    underlined terms
                  </span>{" "}
                  to see definitions.
                </div>
                {chunks.map((chunk, i) => (
                  <div key={i} className="card">
                    <AnnotatedChunk chunk={chunk} terms={terms} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Glossary sidebar */}
          <aside className="space-y-3">
            <div className="sticky top-6">
              <div className="card">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                  Glossary
                </h2>
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="space-y-1">
                        <div className="h-2.5 w-24 animate-pulse rounded bg-border" />
                        <div className="h-2 w-full animate-pulse rounded bg-border" />
                      </div>
                    ))}
                  </div>
                ) : terms.length === 0 ? (
                  <p className="text-xs text-muted">No terms identified.</p>
                ) : (
                  <ul className="space-y-3">
                    {terms.map((t) => (
                      <li key={t.term}>
                        <div className="text-xs font-semibold text-fg">{t.term}</div>
                        <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                          {t.definition}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
