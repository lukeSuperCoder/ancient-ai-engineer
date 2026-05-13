import { z } from "zod";
import { getModelConfig } from "../config";
import type { ToolDefinition } from "../agent/types";
import { fetchJson } from "./http";

const recencySchema = z
  .enum(["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"])
  .default("oneWeek");

const newsArgsSchema = z.object({
  query: z.string().min(1, "搜索关键词不能为空").max(70, "智谱搜索建议 query 不超过 70 个字符"),
  count: z.number().int().min(1).max(10).default(5),
  recency: recencySchema,
  domain: z.string().optional().describe("可选，限定搜索结果域名，例如 example.com"),
});

type NewsArgs = z.infer<typeof newsArgsSchema>;

type BigModelSearchResponse = {
  id?: string;
  created?: number;
  request_id?: string;
  search_intent?: Array<{
    query?: string;
    intent?: string;
    keywords?: string;
  }>;
  search_result?: Array<{
    title?: string;
    content?: string;
    link?: string;
    media?: string;
    icon?: string;
    refer?: string;
    publish_date?: string;
  }>;
};

function requireBigModelKey() {
  const { bigModelApiKey } = getModelConfig();

  if (!bigModelApiKey) {
    throw new Error("缺少 BIGMODEL_API_KEY，无法调用智谱网络搜索 API。");
  }

  return bigModelApiKey;
}

export const newsTool = {
  name: "search_news",
  description: "当用户需要搜索新闻、政策、近期动态、实时信息或网页资料时使用。",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，建议不超过 70 个字符",
      },
      count: {
        type: "number",
        description: "返回结果数量，1 到 10，默认 5",
      },
      recency: {
        type: "string",
        enum: ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"],
        description: "搜索时间范围，默认 oneWeek",
      },
      domain: {
        type: "string",
        description: "可选，限定搜索结果域名，例如 example.com",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  argsSchema: newsArgsSchema,
  async execute(args) {
    const apiKey = requireBigModelKey();
    const { bigModelSearchEngine } = getModelConfig();

    const data = await fetchJson<BigModelSearchResponse>(
      "https://open.bigmodel.cn/api/paas/v4/web_search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          search_query: args.query,
          search_engine: bigModelSearchEngine,
          search_intent: false,
          count: args.count,
          search_domain_filter: args.domain,
          search_recency_filter: args.recency,
          content_size: "medium",
          request_id: crypto.randomUUID(),
          user_id: "mini-chatgpt-local-user",
        }),
      },
      "智谱网络搜索失败",
    );

    return {
      id: data.id,
      requestId: data.request_id,
      created: data.created,
      query: args.query,
      searchEngine: bigModelSearchEngine,
      recency: args.recency,
      intent: data.search_intent ?? [],
      results:
        data.search_result?.map((item) => ({
          title: item.title,
          summary: item.content,
          url: item.link,
          media: item.media,
          refer: item.refer,
          publishDate: item.publish_date,
        })) ?? [],
      source: "BigModel Web Search",
    };
  },
} satisfies ToolDefinition<NewsArgs, unknown>;
