"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, MessageSquare, Pencil, Trash2, X } from "lucide-react";

import Shell from "@/components/Shell";
import { api } from "@/lib/api";

type Section = {
  id: string;
  type: "heading" | "text" | "chart";
  content: string;
  code?: string;
  image_base64?: string;
  comment?: string;
};

export default function ForgeDraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [draft, setDraft] = useState<any | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getForgeDraft(id)
      .then((d) => {
        setDraft(d);
        setTitle(d.title);
        setSections(d.sections ?? []);
        if (d.share_token) {
          setShareUrl(`${window.location.origin}/forge/shared/${d.share_token}`);
        }
      })
      .catch(() => router.replace("/forge"))
      .finally(() => setLoading(false));
  }, [id, router]);

  function scheduleSave(newSections: Section[], newTitle?: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.updateForgeDraft(id, {
          sections: newSections,
          title: newTitle ?? title,
        });
      } catch {}
      setSaving(false);
    }, 800);
  }

  function updateSection(secId: string, content: string) {
    const updated = sections.map((s) => s.id === secId ? { ...s, content } : s);
    setSections(updated);
    scheduleSave(updated);
  }

  function saveComment(secId: string) {
    const updated = sections.map((s) => s.id === secId ? { ...s, comment: commentDraft } : s);
    setSections(updated);
    setCommentingId(null);
    setCommentDraft("");
    scheduleSave(updated);
  }

  function deleteSection(secId: string) {
    const updated = sections.filter((s) => s.id !== secId);
    setSections(updated);
    scheduleSave(updated);
  }

  function updateTitle(v: string) {
    setTitle(v);
    const updated = sections;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try { await api.updateForgeDraft(id, { sections: updated, title: v }); } catch {}
      setSaving(false);
    }, 800);
  }

  async function share() {
    try {
      const { share_token } = await api.shareForgeDraft(id);
      const url = `${window.location.origin}/forge/shared/${share_token}`;
      setShareUrl(url);
    } catch {}
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center text-sm text-muted">Loading draft…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <input
            className="flex-1 border-0 bg-transparent text-2xl font-semibold text-fg outline-none placeholder-muted/40 focus:ring-0"
            value={title}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder="Untitled Draft"
          />
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
            {saving && <span className="animate-pulse">saving…</span>}
            {shareUrl ? (
              <button
                onClick={copyLink}
                className="flex items-center gap-1 chip hover:text-fg hover:border-border/60"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied!" : "Copy link"}
              </button>
            ) : (
              <button
                onClick={share}
                className="flex items-center gap-1 chip hover:text-fg hover:border-border/60"
              >
                <Link2 size={11} />
                Share
              </button>
            )}
          </div>
        </div>

        {shareUrl && (
          <div className="rounded-md border border-border bg-panel2 px-3 py-2 text-xs text-muted font-mono truncate">
            {shareUrl}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((sec) => (
            <SectionBlock
              key={sec.id}
              sec={sec}
              editing={editingId === sec.id}
              commenting={commentingId === sec.id}
              commentDraft={commentingId === sec.id ? commentDraft : ""}
              onEdit={() => setEditingId(sec.id)}
              onEditDone={() => setEditingId(null)}
              onContentChange={(v) => updateSection(sec.id, v)}
              onCommentStart={() => {
                setCommentingId(sec.id);
                setCommentDraft(sec.comment ?? "");
              }}
              onCommentChange={setCommentDraft}
              onCommentSave={() => saveComment(sec.id)}
              onCommentCancel={() => { setCommentingId(null); setCommentDraft(""); }}
              onDelete={() => deleteSection(sec.id)}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function SectionBlock({
  sec, editing, commenting, commentDraft,
  onEdit, onEditDone, onContentChange,
  onCommentStart, onCommentChange, onCommentSave, onCommentCancel,
  onDelete,
}: {
  sec: Section;
  editing: boolean;
  commenting: boolean;
  commentDraft: string;
  onEdit: () => void;
  onEditDone: () => void;
  onContentChange: (v: string) => void;
  onCommentStart: () => void;
  onCommentChange: (v: string) => void;
  onCommentSave: () => void;
  onCommentCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative">
      {/* Section content */}
      {sec.type === "heading" ? (
        editing ? (
          <input
            autoFocus
            className="w-full border-0 bg-transparent text-xl font-semibold text-fg outline-none"
            value={sec.content}
            onChange={(e) => onContentChange(e.target.value)}
            onBlur={onEditDone}
          />
        ) : (
          <h2 className="text-xl font-semibold text-fg">{sec.content}</h2>
        )
      ) : sec.type === "chart" ? (
        <div className="card space-y-2">
          <div className="text-sm font-medium text-fg">{sec.content}</div>
          {sec.image_base64 && (
            <img
              src={`data:image/png;base64,${sec.image_base64}`}
              alt={sec.content}
              className="w-full rounded-md border border-border"
            />
          )}
          {sec.code && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-fg">view code</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-panel2 p-2 font-mono text-[11px] text-muted">{sec.code}</pre>
            </details>
          )}
        </div>
      ) : (
        editing ? (
          <textarea
            autoFocus
            rows={4}
            className="input w-full resize-none"
            value={sec.content}
            onChange={(e) => onContentChange(e.target.value)}
            onBlur={onEditDone}
          />
        ) : (
          <p className="text-sm leading-relaxed text-fg whitespace-pre-wrap">{sec.content}</p>
        )
      )}

      {/* Comment */}
      {sec.comment && !commenting && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-border bg-panel2 px-3 py-2">
          <MessageSquare size={11} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-xs text-muted">{sec.comment}</p>
        </div>
      )}

      {commenting && (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            autoFocus
            rows={2}
            className="input w-full resize-none text-xs"
            placeholder="Add a comment…"
            value={commentDraft}
            onChange={(e) => onCommentChange(e.target.value)}
          />
          <div className="flex gap-1">
            <button onClick={onCommentSave} className="btn btn-primary text-xs py-1 px-2.5">Save</button>
            <button onClick={onCommentCancel} className="btn text-xs py-1 px-2.5">Cancel</button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="absolute right-0 top-0 hidden items-center gap-1 group-hover:flex">
        {sec.type !== "chart" && (
          <button onClick={onEdit} className="chip hover:text-fg hover:border-border/60" title="Edit">
            <Pencil size={11} />
          </button>
        )}
        <button onClick={onCommentStart} className="chip hover:text-fg hover:border-border/60" title="Comment">
          <MessageSquare size={11} />
        </button>
        <button onClick={onDelete} className="chip hover:border-red-400/60 hover:text-red-400 hover:bg-red-50" title="Delete">
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
