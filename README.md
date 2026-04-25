# Alphex — AI Research Acceleration Platform

> Upload papers, search them semantically, and chat with a research assistant
> that's grounded in your personal library and cites every claim.

**Team:** solo build (Alphex)
**Track:** AI tools for research / knowledge work

---

## What we built

A full-stack workspace for reading research papers faster. The flow is:

1. **Ingest** — drop in a PDF or paste an arXiv id / DOI. The backend parses
   the file with PyMuPDF, asks Claude for a five-sentence summary, chunks the
   text, embeds each chunk with `text-embedding-3-small`, and stores everything
   in Supabase Postgres + pgvector.
2. **Search** — cosine similarity over every chunk in your library, scoped by
   user via Supabase RLS.
3. **Chat** — ask a question, the backend retrieves the top-k chunks, builds
   a context block tagged `[S1]` … `[Sn]`, and prompts Claude to answer using
   only those snippets with inline citations. The frontend renders each tag as
   a clickable link to the source paper.
4. **Library + notes** — grid view with read/unread/queued status and tags,
   per-paper detail view with the rendered PDF, related-papers sidebar
   (averaged-embedding cosine lookup), and a notes editor that links each note
   to a paper.
5. **Graph generation** — describe a chart in English, Claude writes
   matplotlib code, the backend executes it in a stripped-down subprocess, and
   the PNG is rendered inline in chat.
6. **LaTeX export** — turn any note or AI summary into a `.tex` file with
   `\cite{}` references auto-built from each linked paper's metadata.

## Stack

| Layer       | Tech                                                       |
|-------------|------------------------------------------------------------|
| Frontend    | Next.js 14 (app router), Tailwind CSS, TypeScript          |
| Backend     | FastAPI (Python 3.11), Uvicorn                             |
| Auth        | Supabase Auth (Google OAuth) + JWT verification in FastAPI |
| Database    | Supabase Postgres                                          |
| Vectors     | `pgvector` (1536-d), ivfflat cosine index                  |
| File store  | Supabase Storage (private `papers` bucket)                 |
| PDF parsing | PyMuPDF                                                    |
| Embeddings  | OpenAI `text-embedding-3-small`                            |
| LLM         | Anthropic Claude `claude-sonnet-4-20250514`                |
| Charts      | Claude → Python (matplotlib) → PNG, executed server-side   |
| Deploy      | Vercel (frontend) + Railway (backend, Dockerfile)          |

## APIs used

- **Anthropic Messages API** — summaries, RAG chat, chart code generation.
- **OpenAI Embeddings API** — `text-embedding-3-small`.
- **Supabase** — Auth, Postgres + pgvector RPC, Storage signed URLs.
- **arXiv API** — metadata + PDF for `arxiv.org/abs/<id>` ingest.
- **Crossref REST API** — DOI metadata for the DOI ingest path.

## Repository layout

```
supabase/schema.sql          — tables, RLS, RPC functions, storage bucket
backend/                     — FastAPI service (Docker → Railway)
  app/main.py                — app factory, CORS, router wiring
  app/auth.py                — Supabase JWT verification dependency
  app/routers/               — ingest, search, chat, papers, notes, graph, latex
  app/services/              — pdf, chunking, embeddings, claude, arxiv, doi
frontend/                    — Next.js 14 app router (Vercel)
  src/app/                   — pages: login, library, papers/[id], chat, search, notes
  src/components/            — Sidebar, Shell, AuthGate, IngestBar, PaperCard
  src/lib/                   — supabase browser client, typed API wrapper
```

## Endpoint reference

| Method | Path                              | Notes                                           |
|--------|-----------------------------------|-------------------------------------------------|
| POST   | `/ingest/upload`                  | multipart PDF                                   |
| POST   | `/ingest/arxiv`                   | `{ "arxiv": "2310.06825" }`                     |
| POST   | `/ingest/doi`                     | `{ "doi": "10.1038/nature14539" }`              |
| POST   | `/search`                         | `{ "query": "...", "k": 8 }`                    |
| POST   | `/chat`                           | RAG, returns `{answer, citations}`              |
| GET    | `/papers`                         | list user's papers                              |
| GET    | `/papers/{id}`                    | metadata + signed PDF URL                       |
| PATCH  | `/papers/{id}`                    | update status / title                           |
| GET    | `/papers/{id}/related`            | cosine-similar peers                            |
| POST   | `/papers/{id}/tags`               | add tag                                         |
| GET/POST/PATCH/DELETE | `/notes`               | CRUD                                            |
| POST   | `/graph`                          | English → matplotlib → PNG                      |
| POST   | `/latex`                          | export note/summary as `.tex` with `\cite{}`    |

All endpoints require `Authorization: Bearer <supabase-jwt>`.

## How to run locally

### 0. Prereqs

- Python 3.11
- Node 18+
- A free Supabase project
- Anthropic + OpenAI API keys
- Google OAuth client (configured in Supabase → Authentication → Providers)

### 1. Database

In the Supabase SQL editor, run the entire contents of `supabase/schema.sql`.
This creates tables, the `match_chunks` and `related_papers` RPCs, the
`papers` storage bucket, and RLS policies.

In Supabase → Authentication → Providers, enable Google and add
`http://localhost:3000/auth/callback` (and your Vercel URL) to the allowed
redirect URLs.

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys
uvicorn app.main:app --reload --port 8000
```

The `SUPABASE_JWT_SECRET` is in Supabase → Project settings → API → "JWT
Settings" → "JWT Secret". The `SUPABASE_SERVICE_ROLE_KEY` is on the same page.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_* values
npm run dev
```

Visit `http://localhost:3000`, sign in with Google, and start uploading.

## Deploy

- **Backend (Railway):** point a service at `backend/Dockerfile`, set every env
  var from `backend/.env.example`, and set `CORS_ORIGINS` to your Vercel URL.
- **Frontend (Vercel):** import the repo with root `frontend/`, set the three
  `NEXT_PUBLIC_*` env vars, and deploy. Add the deployed URL to Supabase's
  allowed redirects.

## Demo path (under 5 minutes)

1. Sign in with Google.
2. Paste `2310.06825` (Mistral 7B) into the arXiv box → wait for the summary.
3. Open the paper detail page, show the PDF and the 5-sentence AI summary.
4. Go to **Search**, query "long context retrieval" → click a hit.
5. Go to **Assistant**, ask "How does this paper compare attention variants?" —
   answer comes back with `[S1]`, `[S2]` citations linking to the source paper.
6. Switch the assistant to **Graph** mode, ask for "bar chart of MMLU scores
   for three open models, illustrative" → PNG appears inline.
7. From a paper, click **export .tex** → download a LaTeX file with a
   pre-built `\cite{}` and matching bib entry.

## Constraints & decisions

- **Reliability over breadth.** P0 (ingest, embed, search, cited chat) is
  written first and tested as the demo path. P1 (notes, related, library
  status) and P2 (graphs, LaTeX) layer on without altering the P0 surfaces.
- **No keys in code.** Backend reads from `.env` via pydantic-settings,
  frontend uses `NEXT_PUBLIC_*` env vars only for the anon key + URL.
- **RLS on every table** so even if the frontend bypassed the API, users
  could only read their own rows. Backend uses the service role key but
  filters every query by `user_id`.
- **Sandboxed graph execution.** Generated Python is filtered for an
  allow-list of imports (`numpy`, `matplotlib`, `os` for `OUT`), runs in a
  20-second `subprocess.run` with a clean env, and only writes to a temp file.

## License

MIT — for hackathon purposes.
