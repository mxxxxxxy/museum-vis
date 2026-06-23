import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 用相对路径打包，部署到任意子路径（如 /collection/）下都能正确加载资源
  base: "./",
  plugins: [react()],
});
