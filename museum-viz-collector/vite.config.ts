import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 默认连本地后端(8787)，方便本地联调；要连线上就：VITE_API_PROXY_TARGET=https://museum.zuantuset.site npm run dev
const devServerTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8787";

export default defineConfig({
  // 用相对路径打包，部署到任意子路径（如 /collection/）下都能正确加载资源
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/exhibition_api": {
        target: devServerTarget,
        changeOrigin: true,
        secure: true,
      },
      "/exhibition_uploads": {
        target: devServerTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
