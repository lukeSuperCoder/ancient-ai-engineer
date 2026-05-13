import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import MarkdownIt from "markdown-it";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("vue", xml);

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, language) {
    // 代码块语言来自模型输出，不能完全信任；先确认 highlight.js 支持该语言。
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, {
          language,
          ignoreIllegals: true,
        }).value;
      } catch {
        // 如果某种语言解析失败，回退到自动高亮，避免整条消息渲染失败。
      }
    }

    return hljs.highlightAuto(code).value;
  },
});

export function renderMarkdown(content: string) {
  // 模型输出本质上仍然是不可信输入：
  // Markdown -> HTML 后必须清洗，再交给 Vue 的 v-html 渲染。
  const html = markdown.render(content);

  return DOMPurify.sanitize(html, {
    USE_PROFILES: {
      html: true,
    },
  });
}
