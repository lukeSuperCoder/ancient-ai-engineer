import cors from "cors";
import express from "express";
import { getModelConfig } from "./config";
import { createChatReply, getPublicModelInfo, streamChatReply } from "./model";

const app = express();
const { port } = getModelConfig();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    model: getPublicModelInfo(),
  });
});

app.post("/api/chat", async (request, response) => {
  try {
    const result = await createChatReply(request.body);
    response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";

    // 不把 API Key、完整上游响应等敏感信息透传给浏览器，只返回可读错误。
    response.status(500).json({
      error: message,
    });
  }
});

function writeSse(response: express.Response, event: string, data: unknown) {
  // SSE 事件格式固定为 event + data + 空行。
  // data 使用 JSON，前端解析时就不用处理换行、引号等边界情况。
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.post("/api/chat/stream", async (request, response) => {
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();

  try {
    for await (const delta of streamChatReply(request.body)) {
      writeSse(response, "delta", { text: delta });
    }

    writeSse(response, "done", {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    writeSse(response, "error", { error: message });
  } finally {
    response.end();
  }
});

app.listen(port, () => {
  console.log(`[chat-api] listening on http://localhost:${port}`);
  console.log(`[chat-api] model config:`, getPublicModelInfo());
});
