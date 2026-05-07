// 把时间戳格式化为聊天气泡里的短时间。
// 单独放到 utils，后续如果要做国际化或相对时间，可以只改这里。
export function formatMessageTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
