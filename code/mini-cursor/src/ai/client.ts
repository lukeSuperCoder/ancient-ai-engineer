import * as vscode from "vscode";

// Mirrors the ai-web-assistant background.js API calling pattern.
// Uses the same Anthropic Messages API format.

interface AIConfig {
  apiBaseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

function getConfig(): AIConfig {
  const cfg = vscode.workspace.getConfiguration("miniCursor");
  return {
    apiBaseURL: cfg.get<string>("apiBaseURL", "https://open.bigmodel.cn/api/anthropic"),
    apiKey: cfg.get<string>("apiKey", ""),
    model: cfg.get<string>("model", "glm-5"),
    maxTokens: cfg.get<number>("maxTokens", 2048),
  };
}

export async function callAI(
  systemPrompt: string,
  userMessage: string,
  token?: vscode.CancellationToken
): Promise<string> {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error(
      "API Key not set. Please run 'Mini Cursor: Open Settings' to configure."
    );
  }

  const url = `${config.apiBaseURL}/v1/messages`;

  const body = JSON.stringify({
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
    signal: token?.isCancellationRequested ? AbortSignal.abort() : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    content?: { type: string; text: string }[];
  };

  if (data.content && data.content.length > 0) {
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }

  throw new Error("Model returned an empty response.");
}

// Strip markdown code fences that models sometimes wrap around code.
export function stripCodeFence(text: string): string {
  const match = text.match(/^```[\w]*\n([\s\S]*?)\n?```\s*$/);
  return match ? match[1] : text;
}

// Parse refactor JSON result, tolerant of markdown wrapping.
export function parseRefactorResult(raw: string): {
  summary: string;
  newCode: string;
  notes: string[];
} {
  const cleaned = stripCodeFence(raw).trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Model sometimes returns JSON inside prose — try to extract it.
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Last resort: treat the entire output as newCode.
    return { summary: "AI returned non-JSON response", newCode: cleaned, notes: [] };
  }
}
