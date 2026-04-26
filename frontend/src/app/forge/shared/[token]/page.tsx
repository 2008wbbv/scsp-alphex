"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

import { api } from "@/lib/api";

export default function SharedDraftPage() {
  const { token } = useParams<{ token: string }>();
  const [draft, setDraft] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSharedDraft(token)
      .then(setDraft)
      .catch((e: any) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-muted">
        <div className="text-center space-y-2">
          <FlaskConical size={32} className="mx-auto text-muted/40" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-muted">
        <div className="animate-pulse text-sm">Loading draft…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="flex items-center gap-2 text-xs text-muted">
          <FlaskConical size={13} />
          <span>Alphex Forge — shared draft</span>
        </div>

        <h1 className="text-3xl font-semibold text-fg">{draft.title}</h1>

        <div className="space-y-4">
          {(draft.sections ?? []).map((sec: any, i: number) => (
            <div key={sec.id ?? i}>
              {sec.type === "heading" ? (
                <h2 className="text-xl font-semibold text-fg">{sec.content}</h2>
              ) : sec.type === "chart" ? (
                <div className="space-y-2 rounded-xl border border-border bg-panel p-4">
                  <div className="text-sm font-medium text-fg">{sec.content}</div>
                  {sec.image_base64 && (
                    <img
                      src={`data:image/png;base64,${sec.image_base64}`}
                      alt={sec.content}
                      className="w-full rounded-md border border-border"
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-fg/90 whitespace-pre-wrap">{sec.content}</p>
              )}
              {sec.comment && (
                <div className="mt-1.5 rounded-md border border-border bg-panel2 px-3 py-2 text-xs text-muted">
                  {sec.comment}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4 text-xs text-muted/50">
          Generated with Alphex · {new Date(draft.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
