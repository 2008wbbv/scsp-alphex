"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { BarChart3, BookOpen, MessageSquare, X } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const AIChatInput = dynamic(
  () => import("@/components/ui/ai-chat-input").then((m) => m.AIChatInput),
  { ssr: false }
);

type Citation = {
  tag: string;
  paper_id: string;
  chunk_id: string;
  title: string;
  page?: number | null;
  authors?: string[];
  year?: number | null;
};

type Msg =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      citations?: Citation[];
      image_base64?: string;
      code?: string;
      streaming?: boolean;
    };

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="p-6 text-muted">Loading…</div>
        </Shell>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const search = useSearchParams();
  const initialPaperId = search?.get("paper") ?? null;

  const [papers, setPapers] = useState<any[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(initialPaperId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"chat" | "graph">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listPapers().then(({ papers }) => setPapers(papers ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [messages]);

  const selectedPaper = papers.find((p) => p.id === selectedPaperId) ?? null;

  async function send(text: string) {
    if (!text.trim() || busy) return;

    const userMsg: Msg = { id: uid(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    try {
      if (mode === "graph") {
        const { image_base64, code } = await api.makeGraph(text);
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", content: "Here's the chart you described:", image_base64, code },
        ]);
      } else {
        const history = messages.slice().map((m) => ({ role: m.role, content: m.content }));
        const assistantId = uid();
        setMessages((m) => [
          ...m,
          { id: assistantId, role: "assistant", content: "", streaming: true },
        ]);
        await api.chatStream(
          text,
          history,
          selectedPaperId ?? undefined,
          (token) => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: (msg as any).content + token }
                  : msg
              )
            );
          },
          (citations) => {
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, citations } : msg))
            );
          }
        );
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, streaming: false } : msg))
        );
      }
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", content: err.message ?? "Something went wrong" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
        {/* Header */}
        <header className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-fg">Assistant</h1>
              <p className="text-xs text-muted">
                Citations appear as{" "}
                <span className="rounded bg-panel2 px-1 font-mono text-[11px] text-fg border border-border">
                  [S1]
                </span>
              </p>
            </div>
            <div className="flex gap-1 rounded-full border border-border bg-panel2 p-0.5">
              <button
                onClick={() => setMode("chat")}
                aria-pressed={mode === "chat"}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  mode === "chat" ? "bg-panel shadow-sm text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <MessageSquare size={12} />
                Chat
              </button>
              <button
                onClick={() => setMode("graph")}
                aria-pressed={mode === "graph"}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  mode === "graph" ? "bg-panel shadow-sm text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <BarChart3 size={12} />
                Graph
              </button>
            </div>
          </div>

          {/* Paper selector */}
          <div className="flex items-center gap-2">
            <BookOpen size={13} className="shrink-0 text-muted" />
            <div className="relative flex-1">
              <select
                value={selectedPaperId ?? ""}
                onChange={(e) => {
                  setSelectedPaperId(e.target.value || null);
                  setMessages([]);
                }}
                className="w-full appearance-none rounded-md border border-border bg-panel pl-2.5 pr-7 py-1.5 text-xs text-fg focus:outline-none focus:border-fg/40"
              >
                <option value="">Entire library</option>
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 8 8">
                <path d="M1 2.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {selectedPaperId && (
              <button
                onClick={() => { setSelectedPaperId(null); setMessages([]); }}
                className="text-muted hover:text-fg transition-colors"
                title="Clear paper scope"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {selectedPaper && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-xs">
              <span className="font-medium text-fg truncate">{selectedPaper.title}</span>
              <Link
                href={`/papers/${selectedPaper.id}`}
                className="ml-auto shrink-0 text-muted hover:text-fg"
              >
                open ↗
              </Link>
            </div>
          )}
        </header>

        {/* Message thread */}
        <div
          ref={scrollRef}
          className="scroll flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-panel/40 p-4"
        >
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-xs text-center">
                <div className="mb-3 flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-panel2 border border-border">
                    {mode === "graph" ? (
                      <BarChart3 size={22} className="text-fg/60" />
                    ) : (
                      <MessageSquare size={22} className="text-fg/60" />
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-fg">
                  {mode === "graph" ? "Describe a chart" : "Ask anything"}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  {mode === "graph"
                    ? "Claude writes Python, the backend executes it, and the PNG appears here."
                    : selectedPaperId
                    ? "Ask about this specific paper."
                    : "Searches across your entire library."}
                </p>
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className="animate-fade-up">
              <Bubble msg={m} />
            </div>
          ))}

        </div>

        <div className="mt-3">
          <AIChatInput
            onSend={send}
            isLoading={busy}
            placeholder={
              mode === "graph"
                ? "e.g. line chart of accuracy vs model size for three models"
                : selectedPaperId
                ? `Ask about "${selectedPaper?.title ?? "this paper"}"`
                : "e.g. how do retrieval-augmented models handle long context?"
            }
          />
        </div>
      </div>
    </Shell>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const isStreaming = msg.role === "assistant" && (msg as any).streaming;
  const isEmpty = msg.role === "assistant" && !msg.content;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-xl p-3.5 text-sm leading-relaxed ${
          isUser
            ? "bg-fg text-white shadow-sm"
            : "border border-border bg-panel text-fg"
        }`}
      >
        {isEmpty && isStreaming ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap">
            {msg.role === "assistant" && msg.citations
              ? renderCited(msg.content, msg.citations)
              : msg.content}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-accent2/70 align-middle" />
            )}
          </div>
        )}

        {msg.role === "assistant" && msg.image_base64 && (
          <img
            src={`data:image/png;base64,${msg.image_base64}`}
            alt="generated chart"
            className="mt-3 w-full rounded-lg border border-border"
          />
        )}

        {msg.role === "assistant" && msg.code && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted hover:text-fg transition-colors">
              view code
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-panel2 p-3 font-mono text-[11px] leading-relaxed text-muted">
              {msg.code}
            </pre>
          </details>
        )}

        {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 border-t border-border pt-2.5">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted">
              Sources
            </div>
            <ul className="space-y-1">
              {msg.citations.map((c) => (
                <li key={c.tag} className="text-xs">
                  <Link
                    href={`/papers/${c.paper_id}`}
                    className="group flex items-baseline gap-1.5 text-muted hover:text-fg transition-colors"
                  >
                    <span className="font-mono text-[10px] text-fg/50 group-hover:text-fg">
                      [{c.tag}]
                    </span>
                    <span className="group-hover:underline">
                      {c.title}{c.page ? ` · p.${c.page}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function renderCited(text: string, citations: Citation[]) {
  if (!citations || !Array.isArray(citations)) return <span>{text}</span>;
  const byTag = new Map(citations.map((c) => [c.tag, c]));
  const parts = text.split(/(\[S\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[S(\d+)\]$/);
    if (!m) return <span key={i}>{part}</span>;
    const c = byTag.get(`S${m[1]}`);
    if (!c) return <span key={i}>{part}</span>;
    return (
      <Link
        key={i}
        href={`/papers/${c.paper_id}`}
        className="mx-0.5 rounded bg-panel2 border border-border px-1 py-0.5 font-mono text-[11px] text-fg hover:bg-panel transition-colors"
        title={c.title}
      >
        {part}
      </Link>
    );
  });
}
