"use client";

import { useRef, useState } from "react";

import { api } from "@/lib/api";

export default function IngestBar({ onIngested }: { onIngested: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [arxiv, setArxiv] = useState("");
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFileChosen(file: File) {
    setError(null);
    setBusy("upload");
    try {
      await api.uploadPdf(file);
      onIngested();
    } catch (e: any) {
      setError(e.message ?? "upload failed");
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
      onIngested();
    } catch (e: any) {
      setError(e.message ?? "DOI import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted">
            Upload PDF
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileChosen(f);
            }}
            className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#6a4ce0]"
          />
          {busy === "upload" && (
            <div className="mt-1 text-xs text-muted">
              Parsing → chunking → embedding…
            </div>
          )}
        </div>

        <form onSubmit={onArxiv}>
          <label className="block text-xs uppercase tracking-wide text-muted">
            Import arXiv
          </label>
          <div className="mt-1 flex gap-2">
            <input
              className="input"
              value={arxiv}
              onChange={(e) => { setArxiv(e.target.value); setError(null); }}
              placeholder="2310.06825 or arxiv.org/abs/…"
            />
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === "arxiv" ? "…" : "Add"}
            </button>
          </div>
        </form>

        <form onSubmit={onDoi}>
          <label className="block text-xs uppercase tracking-wide text-muted">
            Import DOI
          </label>
          <div className="mt-1 flex gap-2">
            <input
              className="input"
              value={doi}
              onChange={(e) => { setDoi(e.target.value); setError(null); }}
              placeholder="10.1038/nature14539"
            />
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === "doi" ? "…" : "Add"}
            </button>
          </div>
        </form>
      </div>
      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
    </div>
  );
}
