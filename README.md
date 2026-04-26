# Alphex — AI Research Acceleration Platform

Import papers, ask anything, publish faster.

---

## Features

**Library** — Upload PDFs, paste arXiv IDs, or drop in DOIs. Papers are chunked, embedded, and indexed automatically on import. Auto-tagged by topic using Claude. Delete papers and manage tags from the library grid.

**Assistant** — Chat with Claude grounded in your library. Every answer cites the exact chunk it came from, inline as `[S1]`. Scope to a single paper or search your entire library. Switch between Chat and Graph modes in the same interface.

**Search** — Semantic vector search across all your papers with a cosine similarity fallback to keyword search.

**Graphs** — Similarity graph showing how your papers relate to each other. Figure library that extracts and renders quantitative charts from any paper, with source citations. Prompt-based chart generation using Claude + matplotlib.

**Annotations** — View any paper with AI-generated hover definitions for technical terms, acronyms, and jargon. Glossary sidebar lists every identified term.

**Notes** — Linked notes attached to papers or freeform. Full CRUD.

**Forge** — Paste raw notes and data, optionally ground it in library papers. Claude generates a structured research draft with heading, text, and chart sections. Edit sections inline, add comments per section, share with a public link.

**LaTeX export** — Turn any note or AI summary into a `.tex` file with `\cite{}` references built from paper metadata.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (app router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.11), Uvicorn |
| Auth | Supabase Auth (Google OAuth + email) + JWT verification in FastAPI |
| Database | Supabase Postgres + pgvector (1536-d, ivfflat cosine index) |
| File storage | Supabase Storage (private `papers` bucket) |
| PDF parsing | PyMuPDF |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Charts | Claude → Python (matplotlib) → PNG, sandboxed subprocess |

## APIs used

- **Anthropic Messages API** — summaries, RAG chat, chart code, annotations, tagging, forge drafts
- **OpenAI Embeddings API** — `text-embedding-3-small`
- **Supabase** — Auth, Postgres + pgvector RPC, Storage signed URLs
- **arXiv API** — metadata + PDF for arXiv ingest
- **Crossref REST API** — DOI metadata for DOI ingest

---

## Repository layout

```
supabase/schema.sql          — tables, RLS, RPC functions, storage bucket
backend/
  app/
    main.py                  — app factory, CORS, router wiring
    auth.py                  — Supabase JWT verification dependency
    db.py                    — service-role Supabase client
    routers/                 — chat, forge, graph, ingest, latex, notes, papers, search
    services/                — claude.py, chunking.py, embeddings.py, doi.py, arxiv.py
frontend/
  src/
    app/                     — pages: library, chat, graph, forge, search, notes, papers/[id], papers/[id]/annotate
    components/              — Shell, Sidebar, AuthGate, IngestBar, PaperCard
    lib/                     — api.ts (typed API client), supabase.ts
```

## Endpoint reference

| Method | Path | Notes |
|---|---|---|
| POST | `/ingest/upload` | multipart PDF |
| POST | `/ingest/arxiv` | `{ "arxiv": "2310.06825" }` |
| POST | `/ingest/doi` | `{ "doi": "10.1038/..." }` |
| POST | `/search` | `{ "query": "...", "k": 8 }` |
| POST | `/chat` | RAG, returns `{ answer, citations }` |
| GET | `/papers` | list user's papers with tags |
| GET/PATCH/DELETE | `/papers/{id}` | metadata, update, delete |
| POST | `/papers/{id}/rechunk` | re-index a paper |
| GET | `/papers/{id}/annotate` | AI term definitions |
| GET | `/papers/{id}/related` | cosine-similar peers |
| POST/DELETE | `/papers/{id}/tags` | manage tags |
| GET | `/papers/graph` | similarity graph data |
| POST | `/graph` | prompt → matplotlib PNG |
| POST | `/graph/paper/{id}` | extract charts from paper |
| POST | `/forge/draft` | generate draft from notes |
| GET | `/forge/drafts` | list user's drafts |
| GET/PATCH/DELETE | `/forge/drafts/{id}` | get, update, delete draft |
| POST | `/forge/drafts/{id}/share` | generate share token |
| GET | `/forge/shared/{token}` | public draft view (no auth) |
| GET/POST/PATCH/DELETE | `/notes` | notes CRUD |
| POST | `/latex` | export as `.tex` with `\cite{}` |

All endpoints except `/forge/shared/{token}` require `Authorization: Bearer <supabase-jwt>`.

---

## Local setup

### Prerequisites

- Python 3.11+, Node 18+
- Supabase project
- Anthropic API key, OpenAI API key

### 1. Database

Run `supabase/schema.sql` in the Supabase SQL editor. This creates all tables, indexes, RLS policies, and the vector search functions.

In Supabase → Authentication → Providers, enable Google and add `http://localhost:3000/auth/callback` to the allowed redirect URLs.

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys
uvicorn app.main:app --reload --port 8000
```

Required env vars:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-20250514
EMBED_MODEL=text-embedding-3-small
CORS_ORIGINS=http://localhost:3000
PORT=8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in Supabase public keys
npm run dev
```

Required env vars:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Open [http://localhost:3000](http://localhost:3000).

---

## Security notes

- **Sandboxed chart execution.** Generated Python is regex-filtered for a blocklist of dangerous imports, runs in a 20-second `subprocess.run` with a minimal clean environment, and only writes to a randomly-named temp file.
- **RLS on every table.** Even if the frontend bypassed the API, Supabase row-level security restricts every user to their own rows. The backend uses the service role key but manually filters every query by the verified `user_id` from the JWT.
- **No keys in code.** Backend reads from `.env` via pydantic-settings; frontend uses `NEXT_PUBLIC_*` env vars only for the anon key and URL.

## License

MIT
