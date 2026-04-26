"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { BarChart3, MessageSquare } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const PromptInputBox = dynamic(
  () => import("@/components/ui/ai-prompt-box").then((m) => m.PromptInputBox),
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
  const paperId = search?.get("paper") ?? null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"chat" | "graph">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [messages]);

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
          {
            id: uid(),
            role: "assistant",
            content: "Here's the chart you described:",
            image_base64,
            code,
          },
        ]);
      } else {
        const history = messages.slice().map((m) => ({ role: m.role, content: m.content }));
        const { answer, citations } = await api.chat(
          text,
          history,
          paperId ?? undefined
        );
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", content: answer, citations },
        ]);
      }
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          content: err.message ?? "Something went wrong",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Assistant</h1>
            <p className="text-xs text-muted">
              {paperId ? "Scoped to one paper." : "Grounded in your library."}{" "}
              Citations appear as{" "}
              <span className="rounded bg-accent/20 px-1 font-mono text-[11px] text-accent2">
                [S1]
              </span>
            </p>
          </div>
          <div className="flex gap-1 rounded-full border border-border bg-panel2 p-0.5">
            <button
              onClick={() => setMode("chat")}
              aria-pressed={mode === "chat"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "chat"
                  ? "bg-accent/20 text-white shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              <MessageSquare size={12} />
              Chat
            </button>
            <button
              onClick={() => setMode("graph")}
              aria-pressed={mode === "graph"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "graph"
                  ? "bg-accent/20 text-white shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              <BarChart3 size={12} />
              Graph
            </button>
          </div>
        </header>

        {/* Message thread */}
        <div
          ref={scrollRef}
          className="scroll flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-panel/20 p-4"
        >
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-xs text-center">
                <div className="mb-3 flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15">
                    {mode === "graph" ? (
                      <BarChart3 size={22} className="text-accent2" />
                    ) : (
                      <MessageSquare size={22} className="text-accent2" />
                    )}
                  </div>
                </div>
                <div className="text-sm font-medium text-white">
                  {mode === "graph" ? "Describe a chart" : "Ask anything"}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {mode === "graph"
                    ? "Claude writes Python, the backend executes it, and the PNG appears here."
                    : "The assistant retrieves relevant passages from your library and cites them inline."}
                </p>
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={m.id} className="animate-fade-up" style={{ animationDelay: `${idx === messages.length - 1 ? 0 : 0}ms` }}>
              <Bubble msg={m} />
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-panel px-4 py-3">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            </div>
          )}
        </div>

        <div className="mt-3">
          <PromptInputBox
            onSend={(msg) => send(msg)}
            isLoading={busy}
            placeholder={
              mode === "graph"
                ? "e.g. line chart of accuracy vs model size for three models"
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
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-xl p-3.5 text-sm leading-relaxed ${
          isUser
            ? "bg-gradient-to-br from-accent/80 to-accent/60 text-white shadow-md shadow-accent/10"
            : "border border-border bg-panel text-white"
        }`}
      >
        <div className="whitespace-pre-wrap">
          {msg.role === "assistant" && msg.citations
            ? renderCited(msg.content, msg.citations)
            : msg.content}
        </div>

        {msg.role === "assistant" && msg.image_base64 && (
          <img
            src={`data:image/png;base64,${msg.image_base64}`}
            alt="generated chart"
            className="mt-3 w-full rounded-lg border border-border bg-white"
          />
        )}

        {msg.role === "assistant" && msg.code && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted hover:text-white transition-colors">
              view code ↓
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-muted/90">
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
                    className="group flex items-baseline gap-1.5 text-muted hover:text-accent2 transition-colors"
                  >
                    <span className="font-mono text-[10px] text-accent2/70 group-hover:text-accent2">
                      [{c.tag}]
                    </span>
                    <span className="group-hover:underline">
                      {c.title}
                      {c.page ? ` · p.${c.page}` : ""}
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
        className="mx-0.5 rounded bg-accent/20 px-1 py-0.5 font-mono text-[11px] text-accent2 hover:bg-accent/30 transition-colors"
        title={c.title}
      >
        {part}
      </Link>
    );
  });
}
