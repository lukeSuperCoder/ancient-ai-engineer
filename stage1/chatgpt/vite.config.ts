import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Vite 是开发服务器和打包工具；这里注册 Vue 与 Tailwind 插件。
export default defineConfig({
  plugins: [vue(), tailwindcss()],
});
