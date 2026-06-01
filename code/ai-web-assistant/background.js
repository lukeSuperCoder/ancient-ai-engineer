// background.js — Background Service Worker
// Handles AI API calls and message routing

const DEFAULT_CONFIG = {
  apiBaseURL: "https://open.bigmodel.cn/api/anthropic",
  apiKey: "",
  model: "glm-5",
  maxTokens: 1024,
};

async function getConfig() {
  const stored = await chrome.storage.local.get("aiConfig");
  return { ...DEFAULT_CONFIG, ...(stored.aiConfig || {}) };
}

async function callAI(systemPrompt, userMessage) {
  const config = await getConfig();

  if (!config.apiKey) {
    throw new Error("API Key not set. Please configure in extension options.");
  }

  const response = await fetch(`${config.apiBaseURL}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.content && data.content.length > 0) {
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }

  throw new Error("Model returned an empty response.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AI_REQUEST") {
    const { systemPrompt, userMessage } = message.payload;

    callAI(systemPrompt, userMessage)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true; // async sendResponse
  }
});
