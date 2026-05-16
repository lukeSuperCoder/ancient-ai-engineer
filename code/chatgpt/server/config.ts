import { config } from "dotenv";
import { resolve } from "node:path";

// 与 stage1/learncc/s01_agent_loop.py 保持同一套环境变量约定：
// - MODEL_ID：统一模型名称
// - ANTHROPIC_API_KEY：Anthropic 协议密钥
// - ANTHROPIC_BASE_URL：可选，指向兼容 Anthropic Messages API 的服务
//
// 这里先加载仓库根目录 .env，再加载 chatgpt 项目内 .env。
// 如果后续需要给本项目单独覆写配置，可以在 stage1/chatgpt/.env 中设置同名变量。
config({ path: resolve(process.cwd(), "../../.env"), override: true });
config({ path: resolve(process.cwd(), ".env"), override: true });

if (process.env.ANTHROPIC_BASE_URL) {
  // learncc 的 Python 版本在自定义 base_url 时会清理 ANTHROPIC_AUTH_TOKEN。
  // Node 版本也保留这个行为，避免兼容服务误读额外鉴权变量。
  delete process.env.ANTHROPIC_AUTH_TOKEN;
}

export interface ModelConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens: number;
  port: number;
  agentMaxSteps: number;
  qweatherApiHost: string;
  qweatherApiToken?: string;
  bigModelApiKey?: string;
  bigModelSearchEngine: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword?: string;
  dbName: string;
  embeddingApiUrl: string;
  embeddingModel: string;
  kbSimilarityThreshold: number;
}

function readRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readNumberEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

export function getModelConfig(): ModelConfig {
  return {
    apiKey: readRequiredEnv("ANTHROPIC_API_KEY"),
    baseURL: process.env.ANTHROPIC_BASE_URL,
    model: readRequiredEnv("MODEL_ID"),
    maxTokens: readNumberEnv("MAX_TOKENS", 1200),
    port: readNumberEnv("CHAT_API_PORT", 8787),
    agentMaxSteps: readNumberEnv("AGENT_MAX_STEPS", 10),
    qweatherApiHost: process.env.QWEATHER_API_HOST || "https://n95khw2yca.re.qweatherapi.com",
    qweatherApiToken: process.env.QWEATHER_API_TOKEN,
    bigModelApiKey: process.env.BIGMODEL_API_KEY,
    bigModelSearchEngine: process.env.BIGMODEL_SEARCH_ENGINE || "search_std",
    dbHost: process.env.DB_HOST || "localhost",
    dbPort: readNumberEnv("DB_PORT", 5432),
    dbUser: process.env.DB_USER || "luke",
    dbPassword: process.env.DB_PASSWORD,
    dbName: process.env.DB_NAME || "vector_db",
    embeddingApiUrl: process.env.EMBEDDING_API_URL || "http://127.0.0.1:11434/v1/embeddings",
    embeddingModel: process.env.EMBEDDING_MODEL || "qwen3-embedding:0.6b",
    kbSimilarityThreshold: readNumberEnv("KB_SIMILARITY_THRESHOLD", 0.3),
  };
}
