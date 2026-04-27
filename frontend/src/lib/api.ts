"use client";

import { supabaseBrowser } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err: any) {
    throw new Error(`Network error: ${err?.message ?? "request failed"}`);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Session expired — please sign in again.");
    if (res.status === 403) throw new Error("You don't have permission to do that.");
    if (res.status >= 500) throw new Error("Server error — please try again later.");
    let message = text || res.statusText || `Request failed (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json.detail ?? json.message ?? message;
    } catch {}
    throw new Error(message);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null as T;
  }
  return (await res.json()) as T;
}

export const api = {
  async listPapers() {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers`, { headers, cache: "no-store" });
    return handle<{ papers: any[] }>(res);
  },

  async getPaper(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/${id}`, { headers, cache: "no-store" });
    return handle<any>(res);
  },

  async updatePaper(id: string, payload: { status?: string; title?: string }) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/papers/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    return handle<any>(res);
  },

  async deletePaper(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/${id}`, { method: "DELETE", headers });
    return handle<any>(res);
  },

  async addTag(paperId: string, name: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/papers/${paperId}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    });
    return handle<any>(res);
  },

  async removeTag(paperId: string, name: string) {
    const headers = await authHeaders();
    const res = await safeFetch(
      `${API_URL}/papers/${paperId}/tags/${encodeURIComponent(name)}`,
      { method: "DELETE", headers }
    );
    return handle<any>(res);
  },

  async related(paperId: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/${paperId}/related`, { headers });
    return handle<{ related: any[] }>(res);
  },

  async getPaperGraph() {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/graph`, { headers });
    return handle<{ nodes: any[]; edges: any[] }>(res);
  },

  async uploadPdf(file: File) {
    const headers = await authHeaders();
    const fd = new FormData();
    fd.append("file", file);
    const res = await safeFetch(`${API_URL}/ingest/upload`, {
      method: "POST",
      headers,
      body: fd,
    });
    return handle<any>(res);
  },

  async ingestArxiv(arxiv: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/ingest/arxiv`, {
      method: "POST",
      headers,
      body: JSON.stringify({ arxiv }),
    });
    return handle<any>(res);
  },

  async importBibtex(file: File) {
    const headers = await authHeaders();
    const fd = new FormData();
    fd.append("file", file);
    const res = await safeFetch(`${API_URL}/ingest/bibtex`, {
      method: "POST",
      headers,
      body: fd,
    });
    return handle<{ imported: number; total: number; errors: { title: string; reason: string }[] }>(res);
  },

  async generateLitReview(paperIds: string[], focus: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/papers/literature-review`, {
      method: "POST",
      headers,
      body: JSON.stringify({ paper_ids: paperIds, focus }),
    });
    return handle<{ text: string; papers: { id: string; title: string; year: number | null; authors: string[] | null }[] }>(res);
  },

  async ingestDoi(doi: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/ingest/doi`, {
      method: "POST",
      headers,
      body: JSON.stringify({ doi }),
    });
    return handle<any>(res);
  },

  async search(query: string, paperId?: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, k: 8, paper_id: paperId ?? null }),
    });
    return handle<{ results: any[] }>(res);
  },

  async chat(message: string, history: { role: string; content: string }[], paperId?: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, history, paper_id: paperId ?? null }),
    });
    return handle<{ answer: string; citations: any[] }>(res);
  },

  async chatStream(
    message: string,
    history: { role: string; content: string }[],
    paperId?: string,
    onToken?: (token: string) => void,
    onCitations?: (citations: any[]) => void,
  ): Promise<void> {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, history, paper_id: paperId ?? null }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed (${res.status})`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "token" && onToken) onToken(data.text);
          if (data.type === "citations" && onCitations) onCitations(data.citations);
          if (data.type === "error") throw new Error(data.message);
        } catch (e: any) {
          if (e?.message && !e.message.startsWith("JSON")) throw e;
        }
      }
    }
  },

  async searchArxiv(q: string): Promise<{ results: any[] }> {
    const headers = await authHeaders();
    const res = await safeFetch(
      `${API_URL}/papers/arxiv-search?q=${encodeURIComponent(q)}`,
      { headers }
    );
    return handle<{ results: any[] }>(res);
  },

  async listNotes(paperId?: string) {
    const headers = await authHeaders();
    const url = paperId
      ? `${API_URL}/notes?paper_id=${paperId}`
      : `${API_URL}/notes`;
    const res = await safeFetch(url, { headers, cache: "no-store" });
    return handle<{ notes: any[] }>(res);
  },

  async createNote(payload: {
    title?: string;
    content: string;
    linked_paper_id?: string | null;
    linked_chunk_id?: string | null;
  }) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/notes`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return handle<any>(res);
  },

  async updateNote(id: string, payload: any) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/notes/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    return handle<any>(res);
  },

  async deleteNote(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/notes/${id}`, { method: "DELETE", headers });
    return handle<any>(res);
  },

  async makeGraph(description: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/graph`, {
      method: "POST",
      headers,
      body: JSON.stringify({ description }),
    });
    return handle<{ image_base64: string; code: string }>(res);
  },

  async getAnnotations(paperId: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/${paperId}/annotate`, { headers });
    return handle<{ chunks: { content: string; page: number | null; chunk_index: number }[]; terms: { term: string; definition: string }[] }>(res);
  },

  async rechunkPaper(paperId: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/${paperId}/rechunk`, {
      method: "POST",
      headers,
    });
    return handle<{ ok: boolean; n_chunks: number }>(res);
  },

  async chartsFromPaper(paperId: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/graph/paper/${paperId}`, {
      method: "POST",
      headers,
    });
    return handle<{ charts: { title: string; explanation: string; image_base64: string; code: string }[] }>(res);
  },

  async createForgeDraft(payload: { title: string; notes: string; paper_ids?: string[] }) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/forge/draft`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return handle<any>(res);
  },

  async listForgeDrafts() {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/forge/drafts`, { headers, cache: "no-store" });
    return handle<{ drafts: any[] }>(res);
  },

  async getForgeDraft(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/forge/drafts/${id}`, { headers, cache: "no-store" });
    return handle<any>(res);
  },

  async updateForgeDraft(id: string, payload: { sections: any[]; title?: string }) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/forge/drafts/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    return handle<any>(res);
  },

  async deleteForgeDraft(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/forge/drafts/${id}`, { method: "DELETE", headers });
    return handle<any>(res);
  },

  async scoreForgeDraft(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/forge/drafts/${id}/score`, {
      method: "POST",
      headers,
    });
    return handle<{ scores: { metric: string; score: number; suggestion: string }[]; overall: number }>(res);
  },

  async shareForgeDraft(id: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/forge/drafts/${id}/share`, { method: "POST", headers });
    return handle<{ share_token: string }>(res);
  },

  async getSharedDraft(token: string) {
    const res = await safeFetch(`${API_URL}/forge/shared/${token}`);
    return handle<any>(res);
  },

  async generateResearchQuestions(paperIds: string[], topics: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/papers/research-questions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ paper_ids: paperIds, topics }),
    });
    return handle<{ questions: string[]; gaps: string[]; hypotheses: string[]; procedure: string[] }>(res);
  },

  async comparePapers(paperId1: string, paperId2: string) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/papers/compare`, {
      method: "POST",
      headers,
      body: JSON.stringify({ paper_id_1: paperId1, paper_id_2: paperId2 }),
    });
    return handle<{
      aspects: { label: string; paper1: string; paper2: string; insight: string }[];
      paper1: { id: string; title: string };
      paper2: { id: string; title: string };
    }>(res);
  },

  async getPaperReferences(paperId: string) {
    const headers = await authHeaders();
    const res = await safeFetch(`${API_URL}/papers/${paperId}/references`, { headers });
    return handle<{ references: any[] }>(res);
  },

  async exportLatex(payload: {
    title?: string;
    body: string;
    paper_ids?: string[];
    note_id?: string | null;
  }) {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await safeFetch(`${API_URL}/latex`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return handle<{ tex: string; bib: string; filename: string }>(res);
  },
};
