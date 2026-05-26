import type { PromptNodeData } from '../types/workflow';

const DEFAULT_MAX_TOKENS = 1024;

export async function callLLM(options: {
  model: string;
  system: string;
  user: string;
  temperature: number;
}): Promise<string> {
  const apiKey = localStorage.getItem('mini-dify.api-key') || '';

  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: options.system,
      messages: [{ role: 'user', content: options.user }],
      temperature: options.temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as any).error?.message || `API 调用失败: ${response.status}`,
    );
  }

  const data = await response.json();

  // Anthropic Messages API 返回格式：content 是 block 数组
  return data.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim();
}
