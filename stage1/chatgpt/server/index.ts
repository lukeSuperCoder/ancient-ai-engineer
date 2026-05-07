import cors from "cors";
import express from "express";
import { getModelConfig } from "./config";
import { createChatReply, getPublicModelInfo } from "./model";

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

app.listen(port, () => {
  console.log(`[chat-api] listening on http://localhost:${port}`);
  console.log(`[chat-api] model config:`, getPublicModelInfo());
});
