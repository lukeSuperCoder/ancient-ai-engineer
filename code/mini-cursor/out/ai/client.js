"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.callAI = callAI;
exports.stripCodeFence = stripCodeFence;
exports.parseRefactorResult = parseRefactorResult;
const vscode = __importStar(require("vscode"));
function getConfig() {
    const cfg = vscode.workspace.getConfiguration("miniCursor");
    return {
        apiBaseURL: cfg.get("apiBaseURL", "https://open.bigmodel.cn/api/anthropic"),
        apiKey: cfg.get("apiKey", ""),
        model: cfg.get("model", "glm-5"),
        maxTokens: cfg.get("maxTokens", 2048),
    };
}
async function callAI(systemPrompt, userMessage, token) {
    const config = getConfig();
    if (!config.apiKey) {
        throw new Error("API Key not set. Please run 'Mini Cursor: Open Settings' to configure.");
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
    const data = (await response.json());
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
function stripCodeFence(text) {
    const match = text.match(/^```[\w]*\n([\s\S]*?)\n?```\s*$/);
    return match ? match[1] : text;
}
// Parse refactor JSON result, tolerant of markdown wrapping.
function parseRefactorResult(raw) {
    const cleaned = stripCodeFence(raw).trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        // Model sometimes returns JSON inside prose — try to extract it.
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        // Last resort: treat the entire output as newCode.
        return { summary: "AI returned non-JSON response", newCode: cleaned, notes: [] };
    }
}
//# sourceMappingURL=client.js.map