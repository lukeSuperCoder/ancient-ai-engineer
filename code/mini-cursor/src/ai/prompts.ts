import { CodeContext } from "../context/builder";

export interface PromptResult {
  systemPrompt: string;
  userMessage: string;
}

export function buildExplainPrompt(ctx: CodeContext): PromptResult {
  const systemPrompt = `你是代码讲解助手。请用中文解释用户选中的代码。
要求：
1. 这段代码的作用
2. 核心执行流程
3. 输入输出分别是什么
4. 可能的风险或注意事项
使用简洁清晰的 Markdown 格式输出。`;

  const userMessage = `文件名：${ctx.fileName}
语言：${ctx.language}

用户选中的代码：
\`\`\`${ctx.language}
${ctx.selectedCode}
\`\`\`

附近上下文：
\`\`\`${ctx.language}
${ctx.surroundingCode}
\`\`\`

请解释这段代码。`;

  return { systemPrompt, userMessage };
}

export function buildRefactorPrompt(ctx: CodeContext): PromptResult {
  const systemPrompt = `你是代码重构助手。
用户会给你一段代码和重构要求，你需要返回 JSON 格式的结果：
{
  "summary": "修改摘要",
  "newCode": "重构后的代码",
  "notes": ["注意事项1", "注意事项2"]
}

要求：
- 只修改选区内的代码
- 保持原有缩进风格
- 保持原有函数签名不变
- 不要修改选区之外的代码
- 必须返回合法的 JSON`;

  const userMessage = `文件名：${ctx.fileName}
语言：${ctx.language}

用户要求：${ctx.instruction || "优化这段代码"}

选中的代码：
\`\`\`${ctx.language}
${ctx.selectedCode}
\`\`\`

附近上下文：
\`\`\`${ctx.language}
${ctx.surroundingCode}
\`\`\`

请返回 JSON 格式的重构结果。`;

  return { systemPrompt, userMessage };
}

export function buildGeneratePrompt(ctx: CodeContext): PromptResult {
  const systemPrompt = `你是代码生成助手。
请只返回要插入的代码，不要返回 Markdown 代码块包裹，不要解释。
保持与当前文件一致的缩进风格和命名规范。`;

  const userMessage = `语言：${ctx.language}
文件名：${ctx.fileName}

当前文件上下文：
\`\`\`${ctx.language}
${ctx.surroundingCode}
\`\`\`

用户需求：${ctx.instruction || ""}

请生成代码。`;

  return { systemPrompt, userMessage };
}

export function buildInlineEditPrompt(ctx: CodeContext): PromptResult {
  const systemPrompt = `你是代码编辑助手。
请只返回修改后的选中代码。
不要返回 Markdown 代码块。
不要解释。
不要修改选区之外的代码。
保持原有缩进风格。
只输出修改后的完整选区代码，不要输出任何其他内容。`;

  const userMessage = `文件名：${ctx.fileName}
语言：${ctx.language}

用户要求：${ctx.instruction || ""}

选中的代码：
\`\`\`${ctx.language}
${ctx.selectedCode}
\`\`\`

附近上下文：
\`\`\`${ctx.language}
${ctx.surroundingCode}
\`\`\`

请只返回修改后的代码。`;

  return { systemPrompt, userMessage };
}
