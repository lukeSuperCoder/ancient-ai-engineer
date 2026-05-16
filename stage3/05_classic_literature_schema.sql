-- 05_classic_literature_schema.sql
--
-- 对应实践：
--   使用本地 qwen3-embedding:0.6b 为《三国演义》全集建立 pgvector 知识库。
--
-- 作用：
--   1. 在本地 PostgreSQL 数据库 vector_db 中启用 pgvector
--   2. 创建中国名著知识库的作品表、章节表、文本块表
--   3. 使用 vector(1024) 匹配 qwen3-embedding:0.6b 的实际输出维度
--   4. 为章节过滤、JSONB 元数据过滤、向量相似度检索创建索引
--
-- 运行：
--   psql -h localhost -p 5432 -U luke -d vector_db -f stage3/05_classic_literature_schema.sql

create extension if not exists vector;

create table if not exists stage3_classic_works (
  id text primary key,
  title text not null,
  author text,
  dynasty text,
  language text not null default 'zh',
  description text,
  source_dir text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stage3_classic_chapters (
  id text primary key,
  work_id text not null references stage3_classic_works(id) on delete cascade,
  chapter_number integer not null,
  chapter_title text not null,
  filename text not null,
  source_path text not null,
  char_count integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, chapter_number)
);

create table if not exists stage3_classic_chunks (
  id bigserial primary key,
  chunk_id text not null unique,
  work_id text not null references stage3_classic_works(id) on delete cascade,
  chapter_id text not null references stage3_classic_chapters(id) on delete cascade,
  chapter_number integer not null,
  chapter_title text not null,
  chunk_index integer not null,
  content text not null,
  content_hash text not null,
  start_char integer not null,
  end_char integer not null,
  token_estimate integer not null,
  source_path text not null,
  metadata jsonb not null default '{}'::jsonb,

  -- qwen3-embedding:0.6b 在本机 /v1/embeddings 返回 1024 维向量。
  -- pgvector 的维度必须和模型输出严格一致，否则插入会失败。
  embedding vector(1024) not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, chunk_index)
);

create index if not exists idx_stage3_classic_chapters_work
  on stage3_classic_chapters (work_id, chapter_number);

create index if not exists idx_stage3_classic_chunks_work
  on stage3_classic_chunks (work_id);

create index if not exists idx_stage3_classic_chunks_chapter
  on stage3_classic_chunks (chapter_id, chunk_index);

create index if not exists idx_stage3_classic_chunks_metadata
  on stage3_classic_chunks using gin (metadata);

create index if not exists idx_stage3_classic_chunks_embedding_hnsw
  on stage3_classic_chunks
  using hnsw (embedding vector_cosine_ops);
