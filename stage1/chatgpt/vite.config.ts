import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Vite 是开发服务器和打包工具；这里注册 Vue 与 Tailwind 插件。
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    // 浏览器请求 /api/chat 时先到 Vite，再由 Vite 转发给后端服务。
    // 这样前端代码不需要关心后端端口，也避免开发阶段的跨域问题。
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
