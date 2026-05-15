-- 03_pgvector_schema.sql
--
-- 对应学习文档：
--   docs/stage3/03-向量数据库与索引原理.md
--
-- 作用：
--   1. 在本地 PostgreSQL 数据库 vector_db 中启用 pgvector
--   2. 创建企业知识库实践用的三张表
--   3. 为 metadata filter 和向量相似度检索创建索引
--
-- 运行：
--   psql -h localhost -p 5432 -U luke -d vector_db -f stage3/03_pgvector_schema.sql

create extension if not exists vector;

create table if not exists stage3_knowledge_bases (
  id text primary key,
  name text not null,
  description text,
  owner_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists stage3_documents (
  id text primary key,
  knowledge_base_id text not null references stage3_knowledge_bases(id) on delete cascade,
  filename text not null,
  file_type text not null,
  status text not null default 'ready',
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists stage3_document_chunks (
  id bigserial primary key,
  chunk_id text not null unique,
  document_id text not null references stage3_documents(id) on delete cascade,
  knowledge_base_id text not null references stage3_knowledge_bases(id) on delete cascade,
  content text not null,
  source text,
  page integer,
  section text,
  chunk_index integer not null,
  metadata jsonb not null default '{}'::jsonb,

  -- 这里使用 vector(7)，是为了匹配本课程 demo 里的 ToyEmbeddingModel。
  -- 真实项目如果使用 OpenAI text-embedding-3-small，通常会改成 vector(1536)。
  -- 如果使用 bge-m3，常见维度是 1024。维度必须和 Embedding 模型输出一致。
  embedding vector(7) not null,

  created_at timestamptz not null default now()
);

create index if not exists idx_stage3_documents_kb
  on stage3_documents (knowledge_base_id);

create index if not exists idx_stage3_chunks_kb
  on stage3_document_chunks (knowledge_base_id);

create index if not exists idx_stage3_chunks_document
  on stage3_document_chunks (document_id);

create index if not exists idx_stage3_chunks_metadata
  on stage3_document_chunks using gin (metadata);

-- HNSW 是 pgvector 支持的近似向量索引。
-- vector_cosine_ops 表示这个索引用于 cosine distance 查询。
-- 查询时使用 embedding <=> query_embedding，距离越小越相似。
create index if not exists idx_stage3_chunks_embedding_hnsw
  on stage3_document_chunks
  using hnsw (embedding vector_cosine_ops);
