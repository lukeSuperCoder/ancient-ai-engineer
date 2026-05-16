import { Pool } from "pg";
import { getModelConfig } from "./config";
import { fetchJson } from "./tools/http";

const modelConfig = getModelConfig();

const pool = new Pool({
  host: modelConfig.dbHost,
  port: modelConfig.dbPort,
  user: modelConfig.dbUser,
  password: modelConfig.dbPassword,
  database: modelConfig.dbName,
});

pool.on("error", (error) => {
  console.error("[db] unexpected pool error:", error.message);
});

export interface SearchResult {
  chunkId: string;
  chapterNumber: number;
  chapterTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

export async function embedQuery(query: string): Promise<number[]> {
  const data = await fetchJson<EmbeddingResponse>(
    modelConfig.embeddingApiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelConfig.embeddingModel,
        input: query,
      }),
    },
    "Embedding API 请求失败",
  );

  if (!data.data?.[0]?.embedding) {
    throw new Error("Embedding API 返回数据格式异常");
  }

  return data.data[0].embedding;
}

function vectorLiteral(vector: number[]): string {
  return "[" + vector.map((v) => v.toFixed(8)).join(",") + "]";
}

export async function searchKnowledgeBase(
  query: string,
  topK = 5,
): Promise<SearchResult[]> {
  const queryVector = await embedQuery(query);
  const vectorStr = vectorLiteral(queryVector);

  const { rows } = await pool.query(
    `
    SELECT
      chunk_id   AS "chunkId",
      chapter_number AS "chapterNumber",
      chapter_title  AS "chapterTitle",
      chunk_index    AS "chunkIndex",
      content,
      1 - (embedding <=> $1::vector) AS similarity
    FROM stage3_classic_chunks
    WHERE work_id = 'classic_sanguo_yanyi'
    ORDER BY embedding <=> $1::vector
    LIMIT $2
    `,
    [vectorStr, topK],
  );

  return rows.filter(
    (row: SearchResult) => row.similarity >= modelConfig.kbSimilarityThreshold,
  );
}
