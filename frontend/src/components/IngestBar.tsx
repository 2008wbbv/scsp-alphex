"use client";

import { useRef, useState } from "react";
import { Upload, Link2, Hash } from "lucide-react";

import { api } from "@/lib/api";

type Tab = "pdf" | "arxiv" | "doi";

const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: "pdf",   label: "Upload PDF", Icon: Upload },
  { key: "arxiv", label: "arXiv",      Icon: Hash },
  { key: "doi",   label: "DOI",        Icon: Link2 },
];

export default function IngestBar({ onIngested }: { onIngested: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("pdf");
  const [arxiv, setArxiv] = useState("");
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  async function onFileChosen(file: File) {
    setError(null);
    setBusy("upload");
    try {
      await api.uploadPdf(file);
      flash("PDF imported — parsing & embedding…");
      onIngested();
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onArxiv(e: React.FormEvent) {
    e.preventDefault();
    if (!arxiv.trim()) { setError("Enter an arXiv ID or URL."); return; }
    setError(null);
    setBusy("arxiv");
    try {
      await api.ingestArxiv(arxiv.trim());
      setArxiv("");
      flash("arXiv paper added to library.");
      onIngested();
    } catch (e: any) {
      setError(e.message ?? "arXiv import failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDoi(e: React.FormEvent) {
    e.preventDefault();
    if (!doi.trim()) { setError("Enter a DOI."); return; }
    setError(null);
    setBusy("doi");
    try {
      await api.ingestDoi(doi.trim());
      setDoi("");
      flash("Paper added via DOI.");
      onIngested();
    } catch (e: any) {
      setError(e.message ?? "DOI import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panel">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setError(null); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-accent text-fg -mb-px"
                : "text-muted hover:text-fg"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="p-4">
        {tab === "pdf" && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="btn btn-primary gap-2 disabled:opacity-40"
            >
              <Upload size={14} />
              {busy === "upload" ? "Processing…" : "Choose PDF"}
            </button>
            <p className="text-xs text-muted">
              {busy === "upload"
                ? "Parsing → chunking → embedding — this takes ~10s"
                : "Accepts standard PDF files up to ~50 MB"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              disabled={busy !== null}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileChosen(f);
              }}
            />
          </div>
        )}

        {tab === "arxiv" && (
          <form onSubmit={onArxiv} className="flex gap-2">
            <input
              className="input max-w-sm"
              value={arxiv}
              onChange={(e) => { setArxiv(e.target.value); setError(null); }}
              placeholder="2310.06825  or  arxiv.org/abs/2310.06825"
            />
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === "arxiv" ? "Importing…" : "Import"}
            </button>
          </form>
        )}

        {tab === "doi" && (
          <form onSubmit={onDoi} className="flex gap-2">
            <input
              className="input max-w-sm"
              value={doi}
              onChange={(e) => { setDoi(e.target.value); setError(null); }}
              placeholder="10.1038/nature14539"
            />
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === "doi" ? "Importing…" : "Import"}
            </button>
          </form>
        )}

        {(error || success) && (
          <p className={`mt-2 text-xs ${error ? "text-red-400" : "text-fg"}`}>
            {error ?? success}
          </p>
        )}
      </div>
    </div>
  );
}
