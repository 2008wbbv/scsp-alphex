-- =====================================================================
-- Alphex — AI Research Acceleration Platform
-- Supabase schema. Run inside the Supabase SQL editor.
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ---------------------------------------------------------------------
-- papers
-- ---------------------------------------------------------------------
create table if not exists papers (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    title         text not null,
    authors       text[] default '{}',
    year          int,
    abstract      text,
    summary       text,
    source_url    text,
    source_type   text default 'upload', -- upload | arxiv | doi
    storage_path  text,
    status        text default 'unread', -- unread | reading | read | queued
    created_at    timestamptz not null default now()
);

create index if not exists papers_user_idx on papers(user_id, created_at desc);
create index if not exists papers_status_idx on papers(user_id, status);

-- ---------------------------------------------------------------------
-- chunks (vector store)
-- ---------------------------------------------------------------------
create table if not exists chunks (
    id           uuid primary key default uuid_generate_v4(),
    paper_id     uuid not null references papers(id) on delete cascade,
    user_id      uuid not null references auth.users(id) on delete cascade,
    content      text not null,
    embedding    vector(1536),
    chunk_index  int not null,
    page         int,
    created_at   timestamptz not null default now()
);

create index if not exists chunks_paper_idx on chunks(paper_id);
create index if not exists chunks_user_idx on chunks(user_id);
create index if not exists chunks_embedding_idx
    on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------
create table if not exists notes (
    id               uuid primary key default uuid_generate_v4(),
    user_id          uuid not null references auth.users(id) on delete cascade,
    title            text,
    content          text not null,
    linked_paper_id  uuid references papers(id) on delete set null,
    linked_chunk_id  uuid references chunks(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists notes_user_idx on notes(user_id, created_at desc);
create index if not exists notes_paper_idx on notes(linked_paper_id);

-- ---------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------
create table if not exists tags (
    id       uuid primary key default uuid_generate_v4(),
    paper_id uuid not null references papers(id) on delete cascade,
    user_id  uuid not null references auth.users(id) on delete cascade,
    name     text not null
);

create unique index if not exists tags_unique_idx on tags(paper_id, lower(name));
create index if not exists tags_user_idx on tags(user_id);

-- ---------------------------------------------------------------------
-- chat_messages — persisted conversation history (optional but cheap)
-- ---------------------------------------------------------------------
create table if not exists chat_messages (
    id         uuid primary key default uuid_generate_v4(),
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null check (role in ('user', 'assistant')),
    content    text not null,
    citations  jsonb default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists chat_user_idx on chat_messages(user_id, created_at);

-- ---------------------------------------------------------------------
-- Match function — semantic search over chunks for a given user
-- ---------------------------------------------------------------------
create or replace function match_chunks(
    query_embedding vector(1536),
    match_user      uuid,
    match_count     int default 8,
    filter_paper    uuid default null
)
returns table (
    chunk_id    uuid,
    paper_id    uuid,
    content     text,
    chunk_index int,
    page        int,
    similarity  float
)
language sql stable
as $$
    select
        c.id            as chunk_id,
        c.paper_id      as paper_id,
        c.content       as content,
        c.chunk_index   as chunk_index,
        c.page          as page,
        1 - (c.embedding <=> query_embedding) as similarity
    from chunks c
    where c.user_id = match_user
      and (filter_paper is null or c.paper_id = filter_paper)
    order by c.embedding <=> query_embedding
    limit match_count;
$$;

-- ---------------------------------------------------------------------
-- Related papers — given a paper, return cosine-similar peers
-- ---------------------------------------------------------------------
create or replace function related_papers(
    source_paper uuid,
    match_user   uuid,
    match_count  int default 5
)
returns table (
    paper_id   uuid,
    similarity float
)
language sql stable
as $$
    with avg_emb as (
        select avg(embedding)::vector(1536) as e
        from chunks
        where paper_id = source_paper
    )
    select c.paper_id,
           1 - (avg(c.embedding <=> (select e from avg_emb))) as similarity
    from chunks c
    where c.user_id = match_user
      and c.paper_id <> source_paper
    group by c.paper_id
    order by similarity desc
    limit match_count;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table papers         enable row level security;
alter table chunks         enable row level security;
alter table notes          enable row level security;
alter table tags           enable row level security;
alter table chat_messages  enable row level security;

drop policy if exists "papers_owner" on papers;
create policy "papers_owner" on papers
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chunks_owner" on chunks;
create policy "chunks_owner" on chunks
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes_owner" on notes;
create policy "notes_owner" on notes
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tags_owner" on tags;
create policy "tags_owner" on tags
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chat_owner" on chat_messages;
create policy "chat_owner" on chat_messages
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Storage bucket for raw PDFs
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('papers', 'papers', false)
on conflict (id) do nothing;

drop policy if exists "papers_storage_owner" on storage.objects;
create policy "papers_storage_owner" on storage.objects
    for all
    using (bucket_id = 'papers' and auth.uid()::text = (storage.foldername(name))[1])
    with check (bucket_id = 'papers' and auth.uid()::text = (storage.foldername(name))[1]);
