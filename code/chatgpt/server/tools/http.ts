export async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  errorPrefix = "外部 API 请求失败",
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${errorPrefix}：HTTP ${response.status} ${text.slice(0, 160)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${errorPrefix}：响应不是合法 JSON`);
  }
}
