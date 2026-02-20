-- Enable pgvector extension for embedding storage
create extension if not exists vector;

-- Knowledge documents table with vector embeddings
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null default 'General',
  source_type text not null default 'manual',  -- 'task' | 'web' | 'pdf' | 'md' | 'manual'
  source_url text,
  source_task_id text,
  tags text[] default '{}',
  metadata jsonb default '{}',
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast vector similarity search
create index if not exists knowledge_documents_embedding_idx
  on public.knowledge_documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for category filtering
create index if not exists knowledge_documents_category_idx
  on public.knowledge_documents (category);

-- Full-text search index
create index if not exists knowledge_documents_fts_idx
  on public.knowledge_documents
  using gin (to_tsvector('english', title || ' ' || content));

-- Updated_at trigger
create or replace function update_knowledge_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger knowledge_documents_updated_at
  before update on public.knowledge_documents
  for each row execute function update_knowledge_updated_at();

-- RPC function for semantic search (cosine similarity)
create or replace function match_knowledge_documents(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count int default 10,
  filter_category text default null
)
returns table (
  id uuid,
  title text,
  content text,
  category text,
  source_type text,
  source_url text,
  source_task_id text,
  tags text[],
  metadata jsonb,
  similarity float,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    kd.id,
    kd.title,
    kd.content,
    kd.category,
    kd.source_type,
    kd.source_url,
    kd.source_task_id,
    kd.tags,
    kd.metadata,
    1 - (kd.embedding <=> query_embedding) as similarity,
    kd.created_at,
    kd.updated_at
  from public.knowledge_documents kd
  where
    kd.embedding is not null
    and 1 - (kd.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or kd.category = filter_category)
  order by kd.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RPC function for full-text search
create or replace function search_knowledge_documents(
  search_query text,
  filter_category text default null,
  result_limit int default 50
)
returns table (
  id uuid,
  title text,
  content text,
  category text,
  source_type text,
  source_url text,
  source_task_id text,
  tags text[],
  metadata jsonb,
  rank float,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    kd.id,
    kd.title,
    kd.content,
    kd.category,
    kd.source_type,
    kd.source_url,
    kd.source_task_id,
    kd.tags,
    kd.metadata,
    ts_rank(to_tsvector('english', kd.title || ' ' || kd.content), plainto_tsquery('english', search_query)) as rank,
    kd.created_at,
    kd.updated_at
  from public.knowledge_documents kd
  where
    to_tsvector('english', kd.title || ' ' || kd.content) @@ plainto_tsquery('english', search_query)
    and (filter_category is null or kd.category = filter_category)
  order by rank desc
  limit result_limit;
end;
$$;

-- Enable RLS
alter table public.knowledge_documents enable row level security;

-- Allow service role full access (bridge server uses service role key)
create policy "Service role has full access to knowledge"
  on public.knowledge_documents
  for all
  using (true)
  with check (true);
