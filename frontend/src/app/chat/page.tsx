"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

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
      <div className="mx-auto flex h-full max-w-4xl flex-col p-6">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Assistant</h1>
            <p className="text-sm text-muted">
              {paperId ? "Scoped to one paper. " : "Grounded in your library. "}
              Citations are inline like [S1].
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setMode("chat")}
              aria-pressed={mode === "chat"}
              className={`chip ${mode === "chat" ? "border-accent bg-accent/20 text-white" : "hover:text-white"}`}
            >
              Chat
            </button>
            <button
              onClick={() => setMode("graph")}
              aria-pressed={mode === "graph"}
              className={`chip ${mode === "graph" ? "border-accent bg-accent/20 text-white" : "hover:text-white"}`}
            >
              Graph
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="scroll flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-panel/30 p-4"
        >
          {messages.length === 0 && (
            <div className="text-sm text-muted">
              {mode === "graph"
                ? "Describe a chart in plain English. Claude will write matplotlib code, the backend will run it, and the PNG will appear here."
                : "Ask a question. The assistant retrieves relevant chunks from your library and cites them inline."}
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
          {busy && <div className="text-sm text-muted">…thinking</div>}
        </div>

        <div className="mt-3">
          <PromptInputBox
            onSend={(msg) => send(msg)}
            isLoading={busy}
            placeholder={
              mode === "graph"
                ? "e.g. line chart of accuracy vs model size for three models"
                : "e.g. how do retrieval-augmented models compare on long context?"
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
        className={`max-w-[80%] rounded-lg p-3 text-sm ${
          isUser
            ? "bg-accent/15 text-white"
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
            className="mt-3 rounded-md border border-border bg-white"
          />
        )}

        {msg.role === "assistant" && msg.code && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted">view code</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-black/40 p-2 font-mono text-[11px] text-muted">
              {msg.code}
            </pre>
          </details>
        )}

        {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
              Sources
            </div>
            <ul className="space-y-1">
              {msg.citations.map((c) => (
                <li key={c.tag} className="text-xs">
                  <Link
                    href={`/papers/${c.paper_id}`}
                    className="text-accent2 hover:underline"
                  >
                    [{c.tag}] {c.title}
                    {c.page ? ` (p.${c.page})` : ""}
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
        className="mx-0.5 rounded-sm bg-accent/20 px-1 text-[11px] font-mono text-accent2"
        title={c.title}
      >
        {part}
      </Link>
    );
  });
}
